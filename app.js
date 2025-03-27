/* My app modules */
const createError = require('http-errors');
// const cron = require("node-cron");
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const sass = require('sass');
const routes = require('./App/routes');

// Import the router directly
const taskHazardRoutes = require('./App/routes/task_hazard.routes');
const assetHierarchyRoutes = require('./App/routes/asset_hierarchy.routes');

const cors = require('cors');

/* My exports */
// const {
//   connection
// } = require('./App/configs');

/* Middleware */
const {
  auth,
  formValidator
} = require('./App/middleware');



// const warehouse = require('./App/routes/warehouse');
// const user = require('./App/routes/user');


/* Express Settings and work */
const app = express();

app.use(cors());

const db = require("./App/models");

// Force sync to apply schema changes
// WARNING: This will drop all tables and recreate them
// Only use this in development, not in production
db.sequelize.sync({ force: true }).then(() => {
  console.log("Drop and re-sync db.");
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());

// SASS middleware configuration
app.use((req, res, next) => {
  if (req.path.endsWith('.scss') || req.path.endsWith('.sass')) {
    const filePath = path.join(__dirname, 'public', req.path);
    sass.compile(filePath, {
      sourceMap: true,
      style: 'compressed'
    }).then(result => {
      res.setHeader('Content-Type', 'text/css');
      res.send(result.css);
    }).catch(next);
  } else {
    next();
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'App', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// app.use('/warehouse', warehouse);
// app.use('/user', user);
app.get('/', function(req,res){
  res.send("Success");
})
app.use('/api', routes);
// Use the routers directly
app.use('/api/task-hazards', taskHazardRoutes);
app.use('/api/asset-hierarchy', assetHierarchyRoutes);
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404, 'The url you have is not available. Please check and try again'));
});

// error handler
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  res.json({
    status: err.status || 500,
    message: err.message
  });

  return false;
});


module.exports = app;


// https://stackoverflow.com/questions/53437535/disable-cors-in-expressjs