const express = require('express');
const { getDatabaseStatus } = require('./config/database');

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

module.exports = app;
