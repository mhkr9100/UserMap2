import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getDb } from './db/index.js';
import statusRouter from './routes/status.js';
import connectionsRouter from './routes/connections.js';
import slackRouter from './routes/slack.js';
import contextRouter from './routes/context.js';
import prismRouter from './routes/prism.js';
import logsRouter from './routes/logs.js';
import connectorsRouter from './routes/connectors.js';
import dashboardRouter from './routes/dashboard.js';
import importRouter from './routes/import.js';
import customApisRouter from './routes/custom-apis.js';

const PORT = parseInt(process.env.PORT ?? '5185', 10);
const APP_URL = process.env.APP_URL ?? `http://localhost:${PORT}`;

const app = express();

// Middleware
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests from the desktop app, localhost, and no-origin (native clients)
    if (!origin) return cb(null, true);
    const allowed = /^https?:\/\/localhost(:\d+)?$/.test(origin);
    if (allowed) {
      cb(null, true);
    } else {
      cb(new Error('CORS: not allowed'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Routes
app.use('/api/status', statusRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api/connect/slack', slackRouter);
app.use('/api/context', contextRouter);
app.use('/api/prism', prismRouter);
app.use('/api/logs', logsRouter);
app.use('/api/connectors', connectorsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/import', importRouter);
app.use('/api/custom-apis', customApisRouter);


// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[UserMap] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize DB eagerly so schema is ready before first request
getDb();

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  UserMap local API server`);
  console.log(`  Listening on ${APP_URL}`);
  console.log(`  Data stored in ${process.env.USERMAP_DATA_DIR ?? '~/.usermap'}\n`);
});

export default app;
