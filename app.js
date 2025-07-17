/* My app modules */
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const sass = require('sass');
const routes = require('./App/routes');
const helmet = require('helmet');
const compression = require('compression');

const cors = require('cors');

/* Express Settings and work */
const app = express();

// Add Helmet middleware for security headers
app.use(helmet());

// Add compression middleware
app.use(compression());

// Security middleware
app.use((req, res, next) => {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  [
    'https://utah-tech.vercel.app',
    'https://18.188.112.65.nip.io',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'http://localhost:3003'
  ];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Check if origin is in allowed origins
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    // Allow all Vercel preview URLs (for development)
    if (origin.includes('vercel.app') || origin.includes('abhipatel13s-projects.vercel.app')) {
      callback(null, true);
      return;
    }

    // Log and block the origin
    console.log('Blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

app.options('*', cors(corsOptions));

// const db = require("./App/models");

// // Sync database without dropping tables
// db.sequelize.sync().then(() => {
//   console.log("Database synced.");
// });

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(logger('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());

// SASS middleware configuration
app.use((req, res, next) => {
  if (req.path.endsWith('.scss') || req.path.endsWith('.sass')) {
    const filePath = path.join(__dirname, 'public', req.path);
    sass.compile(filePath, {
      sourceMap: process.env.NODE_ENV !== 'production',
      style: 'compressed'
    }).then(result => {
      res.setHeader('Content-Type', 'text/css');
      res.send(result.css);
    }).catch(next);
  } else {
    next();
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
}));

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'App', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// API routes
app.get('/', function(req, res) {
  res.send("API is running");
});

app.use('/api', routes);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404, 'The requested resource was not found'));
});

// error handler
app.use(function (err, req, res, next) {
  // Don't leak error details in production
  const error = process.env.NODE_ENV === 'production' ? 
    { message: 'An error occurred' } : 
    { message: err.message, stack: err.stack };

  // Handle authentication errors
  if (err.name === 'UnauthorizedError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      status: false,
      message: err.name === 'TokenExpiredError' ? 'Session expired. Please login again.' : 'Invalid token',
      code: err.name
    });
  }

  res.status(err.status || 500);
  res.json({
    status: err.status || 500,
    ...error
  });
});

module.exports = app;