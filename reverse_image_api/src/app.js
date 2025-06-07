// reverse_image_api/src/app.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ErrorResponseObject } = require('./common/http');
const routes = require('./routes');
const { doReverseSearch } = require('./reverse-search'); // your implementation

const app = express();

// Trust Cloud Run’s proxy so X-Forwarded-For is honored
app.set('trust proxy', 1);

// Environment variables
const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || 'development';

// CORS configuration
app.use(
  cors({
    origin: 'https://shinsekami.github.io',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
  })
);

// Security headers
app.use(helmet());

// Parse JSON bodies
app.use(
  express.json({
    limit: '10mb',
  })
);

// Rate limiting
app.use(
  rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // 20 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: new ErrorResponseObject(
      'Too many requests, please try again later.'
    ),
  })
);

// Reverse‐image search endpoint
app.post('/reverse', async (req, res) => {
  const { base64, annotations } = req.body;
  if (!base64 || !Array.isArray(annotations)) {
    return res
      .status(400)
      .json({ success: false, error: 'Missing base64 or annotations array' });
  }
  try {
    const results = await doReverseSearch(base64, annotations);
    return res.json({ success: true, data: { results } });
  } catch (err) {
    console.error('Reverse search error:', err);
    return res
      .status(500)
      .json({ success: false, error: 'Server error during reverse search' });
  }
});

// Mount other routes
app.use('/', routes);

// Catch-all for undefined routes
app.all('*', (req, res) =>
  res.status(404).json(new ErrorResponseObject('Route not defined'))
);

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  const status = err.status || 500;
  res
    .status(status)
    .json(new ErrorResponseObject(err.message || 'Internal Server Error'));
});

// Start server
app.listen(PORT, () =>
  console.log(`Server running in ${ENV} mode on port ${PORT}`)
);
