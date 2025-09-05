const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // MongoDB connection options
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4 // Use IPv4, skip trying IPv6
    };
    
    // Connect to MongoDB
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cinema-rental', options);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📂 Database: ${conn.connection.name}`);

    // Connection event handlers
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('📱 MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
      await mongoose.connection.close();
      console.log('🔒 MongoDB connection closed through app termination');
      process.exit(0);
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('💡 Tip: Make sure MongoDB is running on your system.');
    }
    if (error.message.includes('authentication failed')) {
      console.error('💡 Tip: Check your MongoDB credentials in the .env file.');
    }
    process.exit(1);
  }
};

// Function to check database connection status
const checkConnection = () => {
  return mongoose.connection.readyState === 1;
};

// Function to get connection info
const getConnectionInfo = () => {
  if (!checkConnection()) {
    return { connected: false };
  }
  
  return {
    connected: true,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name,
  };
};

module.exports = {
  connectDB,
  checkConnection,
  getConnectionInfo
};