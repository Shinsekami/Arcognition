import express from 'express';
import cors from 'cors';
import reverseRouter from './routes/index.js';

const app = express();

// 1) Parse JSON bodies up to 20 MB
app.use(express.json({ limit: '20mb' }));

// 2) Enable CORS (you can restrict origin to your GH-Pages URL if you like)
app.use(cors({ origin: '*' }));

// 3) Mount your reverse-search router at /reverse
app.use('/reverse', reverseRouter);

// 4) Catch-all 404 for any other route
app.all('*', (_req, res) =>
  res.status(404).json({ success: false, message: 'Route not defined' })
);

// 5) Global error handler
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || 'Internal Server Error' });
});

// 6) Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`⇨ Reverse-Image API listening on port ${PORT}`);
});
