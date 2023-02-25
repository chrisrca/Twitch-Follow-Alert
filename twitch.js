// Imports
const WebSocket = require('ws');
const axios = require('axios');
const http = require('http');
const url = require('url');
const open = require('open');
require('dotenv').config();

let socket, websocketid, closeheaders
let first = true

process.on('SIGINT', () => {
  console.log('Deleting Subscription')
  open(`https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${twitchClientId}&redirect_uri=http://localhost:3000&scope=moderator%3Aread%3Afollowers&state=c3ab8aa609ea11e793ae92361f002671&nonce=c3ab8aa609ea11e793ae92361f002671`)
});


// Application Secrets
const twitchClientId = process.env.twitchClientId;
const twitchClientSecret = process.env.twitchClientSecret;
const twitchUserID = process.env.twitchUserID; 

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
    console.log('  Code:', code);
    console.log('  Scope:', scope);
    console.log('  State:', state);
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
      console.log('  Access Token:', response.data.access_token);
      console.log('  Refresh Token:', response.data.refresh_token);
      console.log('  Scopes:', response.data.scope);
    }

    // connect to webentsub websocket
    // see https://dev.twitch.tv/docs/assets/uploads/websocket-message-flow.png  
    socket = new WebSocket('wss://eventsub-beta.wss.twitch.tv/ws');
    // listener for events on websocket
    socket.addEventListener('message', async function (event) {
      event = JSON.parse(event.data)
      // first message is labeled as <session_welcome>
      if (event.metadata.message_type == 'session_welcome') {
        if (first) {
          console.log('  Session ID:', event.payload.session.id);
          console.log('+=====================================================================================+');
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
          axios.delete(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${websocketid}`, { headers }).then(response => {
            console.log('\nSubscription deleted', response.data);
            process.exit(0);
          }).catch(error => {
            console.error('Error deleting subscription:', error.response.data);
            process.exit(0);
          });
        } else {
          // respond to eventsub websocket so it stays open
          axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', body, { headers }).then(response => {
            console.log(response.data)
            console.log('+=====================================================================================+');
            console.log('  Subscription Created with ID:', response.data.data[0].id);
            console.log('+=====================================================================================+');
            websocketid = response.data.data[0].id
            first = false
          })
        }        
      } else {
        // log events that are not welcome events
        console.log("Event:\n", event)
      }
    });
  })
});

// listen on http://localhost:3000
server.listen(3000, 'localhost', () => {
  console.log('+=====================================================================================+');
  console.log('  Server started at http://localhost:3000  ');
  console.log('+=====================================================================================+');
});

// open twitch OAuth url
// this allows the app to get a code which is needed later to retrieve the account token
open(`https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${twitchClientId}&redirect_uri=http://localhost:3000&scope=moderator%3Aread%3Afollowers&state=c3ab8aa609ea11e793ae92361f002671&nonce=c3ab8aa609ea11e793ae92361f002671`)