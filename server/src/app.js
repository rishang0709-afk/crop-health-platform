const express = require('express');

const app = express();

// --- Middleware ---

// Parse JSON request bodies
app.use(express.json());

// --- Routes ---

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'crop-health-backend'
  });
});

module.exports = app;
