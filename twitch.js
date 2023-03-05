// Imports
const WebSocket = require('ws');
const axios = require('axios');
const http = require('http');
const url = require('url');
const open = require('open');
const request = require( 'request-promise-native' )
require('dotenv').config();
console.clear()

let userQueue = []
let socket, websocketid
let first = true

// const worker = new Worker('./eventHandler.js', { workerData: userQueue });

process.on('SIGINT', async () => {
	console.log('> Deleting Subscription\n')
	open(`https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${twitchClientId}&redirect_uri=http://localhost:3000&scope=moderator%3Aread%3Afollowers&state=c3ab8aa609ea11e793ae92361f002671&nonce=c3ab8aa609ea11e793ae92361f002671`)
	await new Promise((resolve) => setTimeout(resolve, 100));
	console.clear()
});

// Application Secrets
const twitchClientId = process.env.twitchClientId;
const twitchClientSecret = process.env.twitchClientSecret;
const twitchUserID = process.env.twitchUserID;

// Push user to 
async function pushUser(username, bearerToken, cliID) {
    request({
      method: 'GET',
      json: true,
      url: 'https://api.twitch.tv/helix/users',
      qs: { login: username },
      headers: {
        'Client-Id': cliID,
        Authorization: `Bearer ${ bearerToken }`
      }
    }).then( value => {
		// check followers.json to see if user has alr followed before pushing
		userQueue.push([value.data[0].display_name, value.data[0].profile_image_url])
		// console.log(userQueue)
	});
}

async function worker() {
	while (true) {
	  // Check if there are any events in the list
	  if (userQueue.length > 0) {
		// Process the first event in the list
		const event = userQueue.shift();
		console.log(`Processing event:`);
		console.log(`  User Name: ${event[0]}`)
		console.log(`  Profile Picture: ${event[1]}`)
	  }
	
	  // Wait for a short amount of time before checking again
	  await new Promise((resolve) => setTimeout(resolve, 1000));
	}
  }
  
// Create http server
const server = http.createServer((req, res) => {
	const queryObject = url.parse(req.url, true).query;
	const code = queryObject.code;
	const scope = queryObject.scope;
	const state = queryObject.state;

	// Ignore empty messages
	if (code == undefined || scope == undefined || state == undefined) {
		return
	}
	if (first) {
		//console.log('  Code:', code);
		//console.log('  Scope:', scope);
		//console.log('  State:', state);
	}
	// Call twitch api using code from OAuth url to get account token
	axios.post('https://id.twitch.tv/oauth2/token', {
		client_id: twitchClientId,
		client_secret: twitchClientSecret,
		code: code,
		grant_type: 'authorization_code',
		redirect_uri: 'http://localhost:3000'
	}).then(response => {
		if (first) {
			//console.log('  Access Token:', response.data.access_token);
			//console.log('  Refresh Token:', response.data.refresh_token);
			//console.log('  Scopes:', response.data.scope);
		}

		// connect to webeventsub websocket
		// see https://dev.twitch.tv/docs/assets/uploads/websocket-message-flow.png  
		socket = new WebSocket('wss://eventsub-beta.wss.twitch.tv/ws');
		// listener for events on websocket
		socket.addEventListener('message', async function(event) {
			event = JSON.parse(event.data)
			// first message is labeled as <session_welcome>
			if (event.metadata.message_type == 'session_keepalive') {
				return
			}
			if (event.metadata.message_type == 'session_welcome') {
				if (first) {
					//console.log('  Session ID:', event.payload.session.id);
					//console.log('+=====================================================================================+');
				}
				// headers needed to let eventsub websocket know you are listening
				const headers = {
					"Client-Id": twitchClientId,
					"Authorization": `Bearer ${response.data.access_token}`,
				}
				// body to request scopes and specify transport type
				const body = {
					"type": "channel.follow",
					"version": "2",
					"condition": {
						"broadcaster_user_id": twitchUserID,
						"moderator_user_id": twitchUserID
					},
					"transport": {
						"method": "websocket",
						"session_id": event.payload.session.id,
					},
				}

				if (!first) {
					axios.delete(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${websocketid}`, {
						headers
					}).then(response => {
						console.log('Terminate batch job (Y/N)?');
						process.exit();
					}).catch(error => {
						// console.error('> Error deleting subscription:', error.response.data);
						process.exit();
					});
				} else {
					// respond to eventsub websocket so it stays open
					axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', body, {
						headers
					}).then(response => {
						//console.log(response.data)
						//console.log('+=====================================================================================+');
						console.log('> Subscription Created with ID:', response.data.data[0].id);
						//console.log('+=====================================================================================+');
						websocketid = response.data.data[0].id
						first = false
					})
					worker()
				}
				// Log Follower Notifs
			} else if (event.metadata.message_type = 'notification') {
				axios.post('https://id.twitch.tv/oauth2/token', {
					client_id: twitchClientId,
					client_secret: twitchClientSecret,
					grant_type: 'client_credentials',
				}).then(response => {
					pushUser(event.payload.event.user_name, response.data.access_token, twitchClientId)
				})
			}
		});
	})
});

// listen on http://localhost:3000
server.listen(3000, 'localhost', () => {
	//console.log('+=====================================================================================+');
	//console.log('  Server started at http://localhost:3000  ');
	//console.log('+=====================================================================================+');
});

// open twitch OAuth url
// this allows the app to get a code which is needed later to retrieve the account token
open(`https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${twitchClientId}&redirect_uri=http://localhost:3000&scope=moderator%3Aread%3Afollowers&state=c3ab8aa609ea11e793ae92361f002671&nonce=c3ab8aa609ea11e793ae92361f002671`)