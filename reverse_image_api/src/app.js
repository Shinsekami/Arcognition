// src/app.js

// ── SUPPRESS GCP MetadataLookupWarning ─────────────────────────────────────────
// Ignore any MetadataLookupWarning emitted by gcp-metadata
process.on('warning', warning => {
  if (warning.name === 'MetadataLookupWarning') return;
  console.warn(`${warning.name}: ${warning.message}`);
});
// Also disable GCE metadata probing at library load time
process.env.GOOGLE_CLOUD_DISABLE_GCE_METADATA = 'true';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const reverseRouter = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 8080;
const ENV = process.env.NODE_ENV || 'development';

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────

// HTTP request logging
app.use(morgan(ENV === 'production' ? 'combined' : 'dev'));

// Security headers
app.use(helmet());

// CORS (allow all origins; adjust in production)
app.use(
  cors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
  })
);

// Rate limiting (100 requests per 15 minutes)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    handler: (req, res) => {
      res.status(429).json({ success: false, error: 'Too many requests' });
    },
  })
);

// JSON body parser (increase payload limit for images)
app.use(express.json({ limit: '20mb' }));

// ── ROUTES ────────────────────────────────────────────────────────────────────

// Reverse-image API
// All POST /reverse calls are handled by src/routes/index.js
app.use('/reverse', reverseRouter);

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 404 handler for any undefined route
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[app] Unhandled error:', err);
  const status = err.status || 500;
  res
    .status(status)
    .json({ success: false, error: err.message || 'Internal Server Error' });
});

// ── START SERVER ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running in ${ENV} mode on http://localhost:${PORT}`);
});
