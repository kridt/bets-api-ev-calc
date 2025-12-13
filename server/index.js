// server/index.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const { initializeSchedulers } = require('./schedulers');
const apiRoutes = require('./routes/api');
const { startAutoTracker } = require('./services/autoEVTracker');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging (skip static files in production)
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || process.env.NODE_ENV !== 'production') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Serve static frontend files in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// API info endpoint (only if not serving frontend)
app.get('/api-info', (req, res) => {
  res.json({
    name: 'EPL Value Bets Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      valueBets: '/api/ev-bets',
      trackingStats: '/api/tracking-stats',
      matches: '/api/matches/:matchId',
      results: '/api/results',
      schedulerStatus: '/api/scheduler/status',
      health: '/api/health'
    }
  });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Development mode - no dist folder yet
    res.json({
      name: 'EPL Value Bets Server',
      status: 'running',
      message: 'Frontend not built. Run "npm run build" first or use "npm run dev" for development.'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: error.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 BETS STATS TRACKING SERVER');
  console.log('='.repeat(60));
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('='.repeat(60) + '\n');

  // Initialize schedulers
  initializeSchedulers();

  // Start auto EV tracker (runs every 2 minutes)
  startAutoTracker(2 * 60 * 1000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n' + '='.repeat(60));
  console.log('👋 Shutting down gracefully...');
  console.log('='.repeat(60));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n' + '='.repeat(60));
  console.log('👋 Shutting down gracefully...');
  console.log('='.repeat(60));
  process.exit(0);
});

module.exports = app;
