// src/hooks/useSocket.js
// WebSocket hook for real-time odds updates with auto-reanalyze and high EV alerts
// NOTE: Socket connection is currently DISABLED while using OpticOdds API directly
// Set SOCKET_DISABLED to false to re-enable odds-notifyer server connection

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

// TOGGLE: Set to false to re-enable odds-notifyer socket connection
const SOCKET_DISABLED = true;

const SOCKET_URL = import.meta.env.VITE_CACHE_SERVER_URL || 'https://odds-notifyer-server.onrender.com';

// High EV threshold for notifications (%)
const HIGH_EV_THRESHOLD = 8;

// Sound for notifications - different sounds for different events
const playNotificationSound = (type = 'update') => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'highEV') {
      // Exciting double beep for high EV
      oscillator.frequency.value = 1200;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.4;
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
      oscillator.stop(audioContext.currentTime + 0.15);

      // Second beep
      setTimeout(() => {
        const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
        const osc2 = ctx2.createOscillator();
        const gain2 = ctx2.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx2.destination);
        osc2.frequency.value = 1400;
        osc2.type = 'sine';
        gain2.gain.value = 0.4;
        osc2.start();
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx2.currentTime + 0.15);
        osc2.stop(ctx2.currentTime + 0.15);
      }, 150);
    } else {
      // Simple beep for updates
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.2;
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      oscillator.stop(audioContext.currentTime + 0.2);
    }
  } catch (e) {
    console.log('[Sound] Could not play notification sound');
  }
};

// Request notification permission
const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
};

// Show browser notification
const showNotification = (title, body, icon = '/favicon.ico') => {
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body,
      icon,
      badge: icon,
      vibrate: [200, 100, 200],
      tag: 'ev-alert',
      renotify: true,
    });

    // Auto close after 10 seconds
    setTimeout(() => notification.close(), 10000);
  }
};

export function useSocket(sport = null) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectedClients, setConnectedClients] = useState(0);

  // Data states
  const [nbaData, setNbaData] = useState({ events: [], odds: {} });
  const [footballData, setFootballData] = useState({ events: {}, odds: {} });

  // Auto-reanalyze callbacks
  const [onDataUpdate, setOnDataUpdate] = useState(null);

  // High EV alerts
  const [highEvAlerts, setHighEvAlerts] = useState([]);

  // Notification settings
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('ev-sound-enabled') !== 'false';
    } catch {
      return true;
    }
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try {
      return localStorage.getItem('ev-notifications-enabled') === 'true';
    } catch {
      return false;
    }
  });
  const [autoReanalyze, setAutoReanalyze] = useState(() => {
    try {
      return localStorage.getItem('ev-auto-reanalyze') === 'true';
    } catch {
      return false;
    }
  });

  const socketRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const onDataUpdateRef = useRef(null);

  // Toggle sound
  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem('ev-sound-enabled', String(newValue));
      } catch {}
      return newValue;
    });
  }, []);

  // Toggle notifications
  const toggleNotifications = useCallback(async () => {
    if (!notificationsEnabled) {
      await requestNotificationPermission();
      if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
        try {
          localStorage.setItem('ev-notifications-enabled', 'true');
        } catch {}
      }
    } else {
      setNotificationsEnabled(false);
      try {
        localStorage.setItem('ev-notifications-enabled', 'false');
      } catch {}
    }
  }, [notificationsEnabled]);

  // Toggle auto-reanalyze
  const toggleAutoReanalyze = useCallback(() => {
    setAutoReanalyze(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem('ev-auto-reanalyze', String(newValue));
      } catch {}
      return newValue;
    });
  }, []);

  // Register callback for data updates (auto-reanalyze)
  const registerOnDataUpdate = useCallback((callback) => {
    onDataUpdateRef.current = callback;
    setOnDataUpdate(() => callback);
  }, []);

  // Add high EV alert
  const addHighEvAlert = useCallback((alert) => {
    setHighEvAlerts(prev => {
      const newAlerts = [alert, ...prev].slice(0, 50); // Keep last 50 alerts
      return newAlerts;
    });

    // Play sound
    if (soundEnabled) {
      playNotificationSound('highEV');
    }

    // Show browser notification
    if (notificationsEnabled) {
      showNotification(
        `🔥 High EV Alert: +${alert.ev.toFixed(1)}%`,
        `${alert.player} ${alert.betType} ${alert.line} @ ${alert.odds.toFixed(2)} (${alert.bookmaker})`,
      );
    }
  }, [soundEnabled, notificationsEnabled]);

  // Clear alerts
  const clearAlerts = useCallback(() => {
    setHighEvAlerts([]);
  }, []);

  // Request refresh via WebSocket
  const requestRefresh = useCallback((type = 'all') => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('requestRefresh', { type });
    }
  }, []);

  useEffect(() => {
    // Skip socket connection if disabled (using OpticOdds API directly)
    if (SOCKET_DISABLED) {
      console.log('[Socket] Connection DISABLED - using OpticOdds API directly');
      return;
    }

    console.log(`[Socket] Connecting to ${SOCKET_URL}...`);

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('[Socket] Connected!');
      setConnected(true);
      reconnectAttempts.current = 0;

      // Subscribe to specific sport if provided
      if (sport) {
        socket.emit('subscribe', { sport });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${reason}`);
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.log(`[Socket] Connection error: ${error.message}`);
      reconnectAttempts.current++;
    });

    // Status updates
    socket.on('status', (data) => {
      setStatus(data);
      setIsRefreshing(data.isRefreshing);
      setConnectedClients(data.connectedClients || 0);
    });

    // Initial data snapshot
    socket.on('snapshot', (data) => {
      console.log('[Socket] Received data snapshot');
      if (data.nba) {
        setNbaData({
          events: data.nba.events?.events || [],
          odds: data.nba.odds?.odds || {}
        });
      }
      if (data.football) {
        setFootballData({
          events: data.football.events?.events || {},
          odds: data.football.odds?.odds || {}
        });
      }
      setLastUpdate(new Date());
    });

    // Refresh events
    socket.on('refreshStart', (data) => {
      console.log(`[Socket] Refresh started: ${data.type}`);
      setIsRefreshing(true);
    });

    socket.on('refreshComplete', (data) => {
      console.log(`[Socket] Refresh complete: ${data.type}`);
      setIsRefreshing(false);
      setStatus(data.status);
      setLastUpdate(new Date());

      // Trigger auto-reanalyze if enabled
      if (autoReanalyze && onDataUpdateRef.current) {
        console.log('[Socket] Auto-reanalyze triggered');
        onDataUpdateRef.current(data.type);
      }
    });

    socket.on('scheduledRefresh', (data) => {
      console.log('[Socket] Scheduled refresh triggered');
      setIsRefreshing(true);
    });

    // NBA updates
    socket.on('nbaUpdate', (data) => {
      console.log('[Socket] NBA data updated');
      setNbaData({
        events: data.events?.events || [],
        odds: data.odds?.odds || {}
      });
      setLastUpdate(new Date());

      // Play sound if enabled
      if (soundEnabled) {
        playNotificationSound('update');
      }

      // Trigger auto-reanalyze if enabled
      if (autoReanalyze && onDataUpdateRef.current && sport === 'nba') {
        console.log('[Socket] Auto-reanalyze NBA triggered');
        onDataUpdateRef.current('nba');
      }
    });

    // Football updates
    socket.on('footballUpdate', (data) => {
      console.log('[Socket] Football data updated');
      setFootballData({
        events: data.events?.events || {},
        odds: data.odds?.odds || {}
      });
      setLastUpdate(new Date());

      // Play sound if enabled
      if (soundEnabled) {
        playNotificationSound('update');
      }

      // Trigger auto-reanalyze if enabled
      if (autoReanalyze && onDataUpdateRef.current && sport === 'football') {
        console.log('[Socket] Auto-reanalyze Football triggered');
        onDataUpdateRef.current('football');
      }
    });

    // Individual odds updates
    socket.on('oddsUpdate', (data) => {
      const { sport: updatedSport, eventId, odds } = data;

      if (updatedSport === 'nba') {
        setNbaData(prev => ({
          ...prev,
          odds: { ...prev.odds, [eventId]: odds }
        }));
      } else if (updatedSport === 'football') {
        setFootballData(prev => ({
          ...prev,
          odds: { ...prev.odds, [eventId]: odds }
        }));
      }
    });

    // Request notification permission on mount
    requestNotificationPermission();

    // Cleanup
    return () => {
      console.log('[Socket] Disconnecting...');
      socket.disconnect();
    };
  }, [sport, soundEnabled, autoReanalyze]);

  return {
    connected,
    status,
    lastUpdate,
    isRefreshing,
    connectedClients,
    nbaData,
    footballData,
    soundEnabled,
    notificationsEnabled,
    autoReanalyze,
    highEvAlerts,
    toggleSound,
    toggleNotifications,
    toggleAutoReanalyze,
    registerOnDataUpdate,
    addHighEvAlert,
    clearAlerts,
    requestRefresh,
    socket: socketRef.current,
  };
}

// Singleton socket for app-wide use
let globalSocket = null;

export function getGlobalSocket() {
  // Return null if socket is disabled
  if (SOCKET_DISABLED) {
    return null;
  }

  if (!globalSocket) {
    globalSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return globalSocket;
}

export { playNotificationSound, showNotification, requestNotificationPermission, HIGH_EV_THRESHOLD };
