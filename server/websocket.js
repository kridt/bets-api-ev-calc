// server/websocket.js
// Socket.IO WebSocket server for real-time cache updates

const { Server } = require('socket.io');
const evCache = require('./services/evCache');

let io = null;

// Initialize WebSocket server
const initWebSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:4000', 'http://localhost:3000'],
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  console.log('[WebSocket] Server initialized');

  // Handle client connections
  io.on('connection', (socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);

    // Send current cache status on connect
    socket.emit('cache:status', evCache.getCacheStatus());

    // Send current cached data if available
    const nbaCache = evCache.getNBACache();
    if (nbaCache.lastUpdated) {
      socket.emit('cache:nba', nbaCache);
    }

    const footballCache = evCache.getFootballCache();
    if (footballCache.lastUpdated) {
      socket.emit('cache:football', footballCache);
    }

    // Handle client requests
    socket.on('request:nba', () => {
      socket.emit('cache:nba', evCache.getNBACache());
    });

    socket.on('request:football', () => {
      socket.emit('cache:football', evCache.getFootballCache());
    });

    socket.on('request:status', () => {
      socket.emit('cache:status', evCache.getCacheStatus());
    });

    socket.on('disconnect', (reason) => {
      console.log(`[WebSocket] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  // Subscribe to cache updates to broadcast to all clients
  evCache.subscribe((eventType, data) => {
    if (!io) return;

    // Handle progress events
    if (eventType.endsWith(':progress')) {
      io.emit('cache:progress', data);
      return;
    }

    // Handle regular cache updates
    const eventName = eventType === 'nba' ? 'cache:nba' : 'cache:football';
    io.emit(eventName, data);
    io.emit('cache:status', evCache.getCacheStatus());

    console.log(`[WebSocket] Broadcast ${eventType} update to ${io.engine?.clientsCount || 0} clients`);
  });

  return io;
};

// Get connected clients count
const getConnectedClientsCount = () => {
  return io?.engine?.clientsCount || 0;
};

// Broadcast message to all clients
const broadcast = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

// Get IO instance
const getIO = () => io;

module.exports = {
  initWebSocket,
  getConnectedClientsCount,
  broadcast,
  getIO,
};
