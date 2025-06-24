#!/usr/bin/env node

/**
 * Error Handler
 */
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

/**
 * Module dependencies.
 */
require("dotenv").config();
const app = require("./app");
const debug = require("debug")("inspection-backend:server");
const http = require("http");

/**
 * Get port from environment and store in Express.
 */
const port = normalizePort(process.env.PORT || "3000");
app.set("port", port);

/**
 * Create HTTP server.
 */
const server = http.createServer(app);

const db = require("./App/models");

// Sync database without dropping tables
db.sequelize.sync().then(function () {
  console.log("Database synced.");

  // Seeds the database with users TODO::Remove after testing
  // const createUsers = require("./scripts/createUsers");
  // createUsers(db.sequelize)
  //   .then(() => {
  //     console.log("Users created successfully.");
  //   })
  //   .catch((err) => {
  //     console.error("Error creating users:", err);
  //   });

  // Adds a single user TODO::Remove after testing
  // const UserController = require("./App/controller/userController");
  // try {
  //   UserController.createUser({
  //     body: {
  //       email: "superuser2@madeupminingco.com",
  //       password: "superuser2123",
  //       role: "superuser",
  //       company: "Madeup Mining Co",
  //     },
  //   });
  // } catch (err) {
  //   console.error("Error creating user:", err.message);
  // }

  /**
   * Listen on provided port, on all network interfaces.
   */
    server.listen(port, () => {
      console.log(`HTTP Server running on port ${port}`);
    });
});

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
server.on("error", (error) => {
  console.error("HTTP Server Error:", error);
});

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening(server) {
  const addr = server.address();
  const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
  console.log(`HTTP Server is running on ${bind}`);
  debug("Listening on " + bind);
}
