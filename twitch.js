const WebSocket = require('ws');
const axios = require('axios');
const http = require('http');
const url = require('url');
const open = require('open');
require('dotenv').config();

// Application Secrets
const twitchClientId = process.env.twitchClientId;
const twitchClientSecret = process.env.twitchClientSecret;
const twitchUserID = process.env.twitchUserID; 

const server = http.createServer((req, res) => {
  const queryObject = url.parse(req.url, true).query;
  const code = queryObject.code;
  const scope = queryObject.scope;
  const state = queryObject.state;

  if (code == undefined || scope == undefined || state == undefined) {
    return
  }
  console.log('  Code:', code);
  console.log('  Scope:', scope);
  console.log('  State:', state);

  axios.post('https://id.twitch.tv/oauth2/token', {
    client_id: twitchClientId,
    client_secret: twitchClientSecret,
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: 'http://localhost:3000'
  }).then(response => {
    console.log('  Access Token:', response.data.access_token);
    console.log('  Refresh Token:', response.data.refresh_token);
    console.log('  Scopes:', response.data.scope);

    const socket = new WebSocket('wss://eventsub-beta.wss.twitch.tv/ws');
    socket.addEventListener('message', async function (event) {
      event = JSON.parse(event.data)
      // Auth message type is <session_welcome>
      if (event.metadata.message_type == 'session_welcome') {
        console.log('  Session ID:', event.payload.session.id);
        console.log('+=====================================================================================+');
       
        const headers = {
          "Client-Id": twitchClientId,
          "Authorization": `Bearer ${response.data.access_token}`,
          'Content-Type': 'application/json',
        }
        
        const body = {
          "type": "channel.follow", // was channel.subscribe
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
    
        axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', body, { headers })
        .then(response => {
          console.log(response.data);
        })
      } else {
        console.log("Event:\n", event)
      }
    });
  })
});

server.listen(3000, 'localhost', () => {
  console.log('+=====================================================================================+');
  console.log('  Server started at http://localhost:3000  ');
  console.log('+=====================================================================================+');
});

open(`https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${twitchClientId}&redirect_uri=http://localhost:3000&scope=moderator%3Aread%3Afollowers&state=c3ab8aa609ea11e793ae92361f002671&nonce=c3ab8aa609ea11e793ae92361f002671`)