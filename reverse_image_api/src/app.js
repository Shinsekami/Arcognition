import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import router from './routes/index.js';
import { ErrorResponseObject } from './common/http.js';

const app = express();

// Trust Cloud Run’s proxy (for X-Forwarded-For and rate-limit)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || 'development';

// CORS: only allow your GitHub Pages domain
app.use(
  cors({
    origin: 'https://shinsekami.github.io',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
  })
);

// Security headers
app.use(helmet());

// JSON body parsing (up to 10 MB)
app.use(express.json({ limit: '10mb' }));

// Rate limiting: 20 requests per minute per IP
app.use(
  rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: new ErrorResponseObject(
      'Too many requests, please try again later.'
    ),
  })
);

// Mount your routes (download_image, detect, reverse)
app.use('/', router);

// 404 handler
app.all('*', (req, res) => {
  res.status(404).json(new ErrorResponseObject('Route not defined'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  const status = err.status || 500;
  res
    .status(status)
    .json(new ErrorResponseObject(err.message || 'Internal Server Error'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running in ${ENV} mode on port ${PORT}`);
});
