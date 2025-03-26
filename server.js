#!/usr/bin/env node

/**
 * Error Handler
 */

process.on('uncaughtException', err => {
    console.log(err);
});

/**
 * Module dependencies.
 */
require('dotenv').config();
const app = require('./app');
const debug = require('debug')('inspection-backend:server');
const http = require('http');
// const https = require('https');
const fs = require('fs');

// const sslKey = fs.readFileSync('./App/configs/keys/tagalongride.key', 'utf8');
// const sslCrt = fs.readFileSync('./App/configs/keys/f979a2feda03e078.crt', 'utf8');
// const sslCredentials = { key: sslKey, cert: sslCrt };

/**
 * Get port from environment and store in Express.
 */

var port = normalizePort(process.env.PORT || '8000');
app.set('port', port);



/**
 * Create HTTP server.
 */
var server = http.createServer(app);
// var httpsServer = https.createServer(sslCredentials, app);
/**
 * Listen on provided port, on all network interfaces.
 */
server.listen(port, ()=>{
    console.log(`listening on port ${port}`);
});

// httpsServer.listen('8443', () =>
// {
//   console.log(`Tagalong listening on port 8443 for HTTPS!`);
// });

server.on('error', onError);
server.on('listening', onListening);
/**
 * Normalize a port into a number, string, or false.
 */


function normalizePort(val) {
    var port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    var bind = typeof port === 'string' ?
        'Pipe ' + port :
        'Port ' + port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
    var addr = server.address();
    var bind = typeof addr === 'string' ?
        'pipe ' + addr :
        'port ' + addr.port;
    debug('Listening on ' + bind);
}