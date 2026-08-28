// Load environment variables from .env file
require('dotenv').config();

const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');

const PORT = process.env.PORT || 5000;

/**
 * Start the server.
 *
 * 1. Connect to MongoDB.
 * 2. Start the HTTP server only after the database is ready.
 * 3. If the database connection fails, log the error and exit.
 */
async function startServer() {
  try {
    await connectDatabase();
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    // Exit so that the problem is visible immediately.
    // The process manager (or developer) can restart once the DB is available.
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
