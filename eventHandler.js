const request = require( 'request-promise-native' )

function getUserInfo(username, bearerToken, cliID) {
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
      console.log( value );
    });
}

module.exports = { getUserInfo }