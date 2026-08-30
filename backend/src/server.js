require('dotenv').config();

// Validate required environment variables before anything else.
// If either JWT secret is missing, tokens would be signed with the
// literal string "undefined" — every token would appear valid to any
// server with the same broken config, which is a serious security hole.
const REQUIRED_ENV = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
const server = http.createServer(app);
const initSocket = require('./sockets/socket');
initSocket(server);

const cookieParser = require('cookie-parser');

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const projectRoutes = require('./routes/projectRoutes');
app.use('/api/projects', projectRoutes);

const myTasksRoutes = require('./routes/myTasksRoutes');
app.use('/api/tasks', myTasksRoutes);

const dashboardRoutes = require('./routes/dashboardRoutes');
app.use('/api/dashboard', dashboardRoutes);

// Simple health check route — confirms the server boots correctly
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler — catches any error passed via next(err) or unhandled
// async rejections that bubble up through Express. Without this, Express sends
// a plain-text 500 with a stack trace visible to clients, and the request hangs
// if no response was sent yet.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
