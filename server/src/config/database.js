/**
 * database.js
 *
 * MongoDB connection configuration for the Crop Health Platform backend.
 *
 * Usage:
 *   const { connectDatabase, getDatabaseStatus } = require('./config/database');
 *   await connectDatabase();
 */

const mongoose = require('mongoose');

// Tracks whether the connection is currently established.
// Used by the health check endpoint.
let isConnected = false;

/**
 * Connect to MongoDB using the MONGODB_URI environment variable.
 *
 * - Resolves when the connection is successful.
 * - Rejects (throws) when the connection cannot be established.
 * - The caller (server.js) is responsible for deciding whether to
 *   exit the process or continue in a degraded state.
 */
async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Add it to your .env file. See .env.example.'
    );
  }

  // Connect to MongoDB.
  // useNewUrlParser and useUnifiedTopology are no longer needed in
  // Mongoose 7+ but are harmless if included for older versions.
  await mongoose.connect(uri);

  isConnected = true;

  // Log connection without exposing the full URI (which may contain credentials).
  const host = mongoose.connection.host;
  const dbName = mongoose.connection.name;
  console.log(`MongoDB connected: ${host} / ${dbName}`);

  // Handle unexpected disconnection after initial connect.
  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('MongoDB disconnected.');
  });

  // Handle reconnection.
  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    console.log('MongoDB reconnected.');
  });
}

/**
 * Returns a simple status object describing the current database connection.
 * Used by the health check endpoint.
 *
 * @returns {{ status: string, connected: boolean }}
 */
function getDatabaseStatus() {
  return {
    status: isConnected ? 'connected' : 'disconnected',
    connected: isConnected,
  };
}

module.exports = { connectDatabase, getDatabaseStatus };
