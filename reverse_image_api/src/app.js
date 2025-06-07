import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ErrorResponseObject } from './common/http.js';
import routes from './routes/index.js';

const app = express();
const PORT = process.env.PORT ?? 5000;
const ENV = process.env.NODE_ENV ?? 'development';

// CORS configuration
const corsOptions = {
  origin: '*',
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// 1. Enable CORS for all routes
app.use(cors(corsOptions));

// 2. Handle preflight requests
app.options('*', cors(corsOptions));

// 3. Security & parsing middleware
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// 4. Rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: new ErrorResponseObject(
      'Too many requests, please try again later.'
    ),
  })
);

// 5. Mount your routes
app.use('/', routes);

// 6. 404 for undefined routes
app.all('*', (req, res) => {
  res.status(404).json(new ErrorResponseObject('Route not defined'));
});

// 7. Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  const status = err.status ?? 500;
  res
    .status(status)
    .json(new ErrorResponseObject(err.message ?? 'Internal Server Error'));
});

// 8. Start the server
app.listen(PORT, () => {
  console.log(`Server running in ${ENV} mode on http://localhost:${PORT}`);
});
