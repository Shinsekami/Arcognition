// ── SUPPRESS GCP MetadataLookupWarning ─────────────────────────────────────────
// Ignore MetadataLookupWarning from gcp-metadata
process.on('warning', warning => {
  if (warning.name === 'MetadataLookupWarning') return;
  console.warn(`${warning.name}: ${warning.message}`);
});
// Disable GCE metadata probing at library load time
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

// ── SETTINGS ───────────────────────────────────────────────────────────────────
// Trust the first proxy (e.g. Cloud Run) so rate-limit sees correct IP
app.set('trust proxy', 1);

// ── MIDDLEWARE ─────────────────────────────────────────────────────────────────
// Logging
app.use(morgan(ENV === 'production' ? 'combined' : 'dev'));

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
  })
);

// Rate limiting: 100 requests per 15 minutes per IP
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    handler: (req, res) => {
      res.status(429).json({ success: false, error: 'Too many requests' });
    },
  })
);

// JSON body parser (up to 20 MB)
app.use(express.json({ limit: '20mb' }));

// ── ROUTES ─────────────────────────────────────────────────────────────────────
// Reverse-image search endpoint
app.use('/reverse', reverseRouter);

// Health check
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 404 catch-all
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

// ── START SERVER ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running in ${ENV} mode on http://localhost:${PORT}`);
});
