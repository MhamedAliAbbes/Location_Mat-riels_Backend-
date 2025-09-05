// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

// Import database connection logic from db.js
const { connectDB } = require('./config/database');

console.log('🚀 Starting Cinema Equipment Rental Server...');

// Create Express application
const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
      : ['http://localhost:3000'];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));

// Body parsing and compression middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- API Routes ---

// Health check and API info routes
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api', (req, res) => {
  res.json({
    message: 'Welcome to Cinema Equipment Rental API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      equipment: '/api/equipment',
      reservations: '/api/reservations',
    },
  });
});

// Load main application routes
const authRoutes = require('./routes/auth');
const equipmentRoutes = require('./routes/equipment');
const reservationRoutes = require('./routes/reservations');

app.use('/api/auth', authRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/reservations', reservationRoutes);

// --- Error Handling ---

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Global Error Handler:', err.message);

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors || {}).map(e => e.message);
    return res.status(400).json({ success: false, message: 'Validation error', errors });
  }

  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(400).json({ success: false, message: `${field} already exists` });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// --- Server Startup ---

const startServer = async () => {
  try {
    // Connect to the database using the function from db.js
    await connectDB();

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log('🎬 ============================================');
      console.log(`🚀 Cinema Equipment Rental Server Started`);
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/health`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('⚠️  Rate limiting: DISABLED');
      console.log('============================================');
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;