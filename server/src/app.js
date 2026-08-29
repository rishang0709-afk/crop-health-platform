const express = require('express');
const { getDatabaseStatus } = require('./config/database');
const authRoutes = require('./routes/authRoutes');

const app = express();

// --- Middleware ---

// Parse JSON request bodies
app.use(express.json());

// --- Routes ---

// Health check
// Returns service status and database connection status.
// Existing fields (status, service) are preserved for backward compatibility.
app.get('/api/health', (req, res) => {
  const db = getDatabaseStatus();

  res.json({
    status: 'ok',
    service: 'crop-health-backend',
    database: {
      status: db.status,
      connected: db.connected,
    },
  });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// --- Global error handler ---
// Must be defined last, after all routes.
// Returns consistent JSON error responses and never leaks stack traces
// to clients in production.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred.'
          : err.message,
    },
  });
});

module.exports = app;
