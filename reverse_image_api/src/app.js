import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import router from './routes/index.js'; // your download_image, detect & reverse routes
import { ErrorResponseObject } from '../common/http.js';

const app = express();

// 1) Trust Cloud Run’s proxy for rate-limiting behind the load balancer
app.set('trust proxy', 1);

// 2) Enable CORS for your GitHub Pages origin (handles preflight OPTIONS too)
app.use(
  cors({
    origin: 'https://shinsekami.github.io',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
  })
);
app.options(
  '*',
  cors({
    origin: 'https://shinsekami.github.io',
  })
);

// 3) Security headers
app.use(helmet());

// 4) Parse JSON bodies (up to 10 MB)
app.use(express.json({ limit: '10mb' }));

// 5) Rate-limit: 20 requests per minute per IP
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

// 6) Mount your routes: /download_image, /detect, /reverse
app.use('/', router);

// 7) Catch-all 404
app.all('*', (req, res) =>
  res.status(404).json(new ErrorResponseObject('Route not defined'))
);

// 8) Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  const status = err.status || 500;
  res
    .status(status)
    .json(new ErrorResponseObject(err.message || 'Internal Server Error'));
});

// 9) Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Reverse‐Image API running on port ${PORT}`)
);
