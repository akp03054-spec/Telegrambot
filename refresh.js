// Glitch keep alive
const https = require('https');
const appUrl = 'https://your-project-name.glitch.me';

function keepAlive() {
    https.get(appUrl, (res) => {
        console.log('Keep-alive ping sent:', res.statusCode);
    }).on('error', (err) => {
        console.log('Keep-alive error:', err.message);
    });
}

// Ping every 5 minutes
setInterval(keepAlive, 5 * 60 * 1000);

// Initial ping
keepAlive();

module.exports = keepAlive;