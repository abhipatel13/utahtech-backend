const https = require('https');
const fs = require('fs');
const path = require('path');

const options = {
    key: fs.readFileSync('/etc/ssl/private/server.key'),
    cert: fs.readFileSync('/etc/ssl/certs/server.crt')
};

const server = https.createServer(options, (req, res) => {
    res.writeHead(200);
    res.end('HTTPS Server is working!\n');
});

server.listen(443, () => {
    console.log('HTTPS Server running on port 443');
});

server.on('error', (error) => {
    console.error('Server error:', error);
}); 