#!/usr/bin/env node

/**
 * Error Handler
 */
process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

/**
 * Module dependencies.
 */
require('dotenv').config();
const app = require('./app');
const debug = require('debug')('inspection-backend:server');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Get port from environment and store in Express.
 */
const httpPort = normalizePort(process.env.PORT || '3000');
const httpsPort = normalizePort(process.env.HTTPS_PORT || '443');
app.set('port', httpPort);
app.set('httpsPort', httpsPort);

/**
 * Create HTTP and HTTPS servers.
 */
const httpServer = http.createServer(app);

// Create HTTPS server only if SSL certificates exist
let httpsServer;
try {
    console.log('Loading SSL certificates from:', {
        key: process.env.SSL_KEY_PATH,
        cert: process.env.SSL_CERT_PATH
    });
    
    const sslOptions = {
        key: fs.readFileSync(process.env.SSL_KEY_PATH),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH)
    };
    httpsServer = https.createServer(sslOptions, app);
    console.log('SSL certificates loaded successfully');
} catch (error) {
    console.error('Error loading SSL certificates:', error.message);
    console.error('Stack trace:', error.stack);
}

/**
 * Listen on provided ports, on all network interfaces.
 */
httpServer.listen(httpPort, () => {
    console.log(`HTTP Server running on port ${httpPort}`);
});

if (httpsServer) {
    httpsServer.listen(httpsPort, () => {
        console.log(`HTTPS Server running on port ${httpsPort}`);
    });
} else {
    console.error('HTTPS server not started due to SSL certificate issues');
}

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
    const port = parseInt(val, 10);
    if (isNaN(port)) return val;
    if (port >= 0) return port;
    return false;
}

// Error handler for HTTP server
httpServer.on('error', (error) => {
    console.error('HTTP Server Error:', error);
});

// Error handler for HTTPS server
if (httpsServer) {
    httpsServer.on('error', (error) => {
        console.error('HTTPS Server Error:', error);
    });
}

/**
 * Event listener for HTTP/HTTPS server "listening" event.
 */
function onListening(server, protocol) {
    const addr = server.address();
    const bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
    console.log(`${protocol} Server is running on ${bind}`);
    debug('Listening on ' + bind);
}