// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const aiRoutes = require('./routes/ai');
const path = require('path'); 
const cleanupService = require('./services/cleanupService');
require('dotenv').config();

// Import database connection logic from db.js
const { connectDB } = require('./config/database');

console.log('🚀 Starting Cinema Equipment Rental Server...');

// Create Express application
const app = express();

// server.js - Update the corsOptions
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
      : [
          'http://localhost:3000',
          'http://localhost:3001', 
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001'
        ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`CORS: Origin ${origin} not allowed`);
      callback(null, true); // Allow anyway in development
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // ADD PATCH HERE
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-Access-Token'
  ],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Security middleware (relaxed for development)
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP in development
    crossOriginEmbedderPolicy: false,
  })
);

// Body parsing and compression middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request Body:', req.body);
  }
  next();
});

// Mount AI routes FIRST (before other routes)
app.use('/api/ai', aiRoutes);

// --- API Routes ---

// Health check and API info routes
app.get('/health', (req, res) => {
  const cleanupStatus = cleanupService.getStatus();
  res.json({
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:5002',
    cleanupService: cleanupStatus,
    cors: {
      allowedOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000']
    }
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
      users: '/api/users',
      ai: '/api/ai'
    },
  });
});

// Load main application routes
const authRoutes = require('./routes/auth');
const equipmentRoutes = require('./routes/equipment');
const reservationRoutes = require('./routes/reservations');
const userRoutes = require('./routes/users');

app.use('/api/auth', authRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/users', userRoutes);

// --- Error Handling ---

// 404 handler
app.use((req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    availableRoutes: [
      'GET /health',
      'GET /api',
      'POST /api/auth/login',
      'GET /api/equipment',
      'GET /api/users',
      'POST /api/ai/recommendations',
      'GET /api/ai/test-connection'
    ]
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Global Error Handler:', err.message);
  console.error('Stack:', err.stack);

  // CORS error
  if (err.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation',
      error: 'Origin not allowed'
    });
  }

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
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// --- Server Startup ---

const startServer = async () => {
  try {
    // Connect to the database using the function from db.js
    await connectDB();

    // Initialize cleanup service after database connection
    console.log('🔧 Initializing cleanup service...');
    cleanupService.start();
    console.log('✅ Cleanup service started');
    
    // Run initial cleanup on startup
    console.log('🧹 Running initial cleanup...');
    const initialCleanup = await cleanupService.runImmediateCleanup();
    console.log('✅ Initial cleanup completed:', {
      expired: initialCleanup.expired,
      processed: initialCleanup.processed
    });

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log('🎬 ============================================');
      console.log(`🚀 Cinema Equipment Rental Server Started`);
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/health`);
      console.log(`🤖 AI Service: ${process.env.AI_SERVICE_URL || 'http://localhost:5001'}`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌍 CORS Origins: ${process.env.CORS_ORIGINS || 'http://localhost:3000'}`);
      console.log('⚠️  Rate limiting: DISABLED');
      console.log('👥 User Management: ENABLED');
      console.log('🧹 Cleanup Service: ENABLED');
      console.log('============================================');
    });

    // Test AI connection on startup
    setTimeout(async () => {
      try {
        const aiService = require('./services/aiService');
        const isConnected = await aiService.testConnection();
        console.log(`🤖 AI Service Connection: ${isConnected ? '✅ Connected' : '❌ Failed'}`);
      } catch (error) {
        console.log(`🤖 AI Service Connection: ❌ Failed - ${error.message}`);
      }
    }, 2000);

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
      
      try {
        // Stop cleanup service
        cleanupService.stop();
        console.log('✅ Cleanup service stopped');
        
        // Close server
        server.close(() => {
          // Close database connection
          mongoose.connection.close();
          console.log('✅ Database connection closed');
          console.log('✅ Graceful shutdown completed');
          process.exit(0);
        });
        
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;