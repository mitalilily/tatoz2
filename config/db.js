const mongoose = require('mongoose');

const INITIAL_RETRY_INTERVAL_MS = 1000;
const MAX_RETRY_INTERVAL_MS = 30000;

const connectionOptions = {
  maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 50,
  minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 5,
  serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 5000,
  connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS) || 10000,
  socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000,
  retryWrites: true,
};

const isReady = () => mongoose.connection.readyState === 1;

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }

  let retryDelay = INITIAL_RETRY_INTERVAL_MS;
  while (!isReady()) {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI, connectionOptions);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      console.error(`MongoDB connection error: ${error.message}; retrying in ${retryDelay}ms`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(MAX_RETRY_INTERVAL_MS, retryDelay * 2);
    }
  }
  return mongoose.connection;
};

module.exports = connectDB;
module.exports.isReady = isReady;
module.exports.connectionOptions = connectionOptions;
