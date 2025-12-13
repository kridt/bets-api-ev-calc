// src/hooks/useCacheSocket.js
// WebSocket hook for connecting to cache updates via Socket.IO

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

// Server URL - use environment variable in production, localhost in dev
const getSocketUrl = () => {
  // Check for explicit server URL first
  if (import.meta.env.VITE_API_SERVER_URL) {
    return import.meta.env.VITE_API_SERVER_URL;
  }
  // Fallback to localhost in dev
  if (!import.meta.env.PROD) {
    return 'http://localhost:4000';
  }
  // Default production URL (Render) - epl-value-bets uses OpticOdds
  return 'https://epl-value-bets.onrender.com';
};

/**
 * Hook to connect to the cache WebSocket server
 * @param {string} sport - 'nba' or 'football'
 * @returns {Object} - { data, status, isConnected, lastUpdated, refresh, error }
 */
export const useCacheSocket = (sport = 'nba') => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  // Connect to WebSocket
  useEffect(() => {
    const socketUrl = getSocketUrl();
    console.log(`[useCacheSocket] Connecting to ${socketUrl} for ${sport}...`);

    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[useCacheSocket] Connected: ${socket.id}`);
      setIsConnected(true);
      setError(null);
      // Request fresh data on connect
      socket.emit(`request:${sport}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[useCacheSocket] Disconnected: ${reason}`);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error(`[useCacheSocket] Connection error:`, err.message);
      setError(`Connection error: ${err.message}`);
      setIsConnected(false);
    });

    // Listen for sport-specific updates
    socket.on(`cache:${sport}`, (cacheData) => {
      console.log(`[useCacheSocket] Received ${sport} update:`, {
        evBets: cacheData.evBets?.length || 0,
        matches: cacheData.matches?.length || 0,
        lastUpdated: cacheData.lastUpdated,
      });
      setData(cacheData);
      setError(null);
    });

    // Listen for status updates
    socket.on('cache:status', (statusData) => {
      console.log(`[useCacheSocket] Status update:`, statusData);
      setStatus(statusData);
    });

    // Listen for progress updates
    socket.on('cache:progress', (progressData) => {
      // Only update if this progress is for our sport
      if (progressData.sport === sport) {
        setProgress(progressData.progress);
      }
    });

    return () => {
      console.log(`[useCacheSocket] Cleaning up socket...`);
      socket.disconnect();
    };
  }, [sport]);

  // Request fresh data
  const refresh = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log(`[useCacheSocket] Requesting ${sport} refresh...`);
      socketRef.current.emit(`request:${sport}`);
    } else {
      console.warn('[useCacheSocket] Socket not connected, cannot refresh');
    }
  }, [sport]);

  // Manual server-side cache refresh
  const triggerServerRefresh = useCallback(async () => {
    try {
      const serverUrl = getSocketUrl();
      const response = await fetch(`${serverUrl}/api/cache/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sport }),
      });
      const result = await response.json();
      console.log(`[useCacheSocket] Server refresh triggered:`, result);
      return result;
    } catch (err) {
      console.error('[useCacheSocket] Failed to trigger server refresh:', err);
      throw err;
    }
  }, [sport]);

  return {
    data,
    evBets: data?.evBets || [],
    matches: data?.matches || [],
    stats: data?.stats || null,
    status,
    progress,
    isConnected,
    isRefreshing: data?.isRefreshing || status?.cache?.[sport]?.isRefreshing || false,
    lastUpdated: data?.lastUpdated || null,
    error: data?.error || error,
    refresh,
    triggerServerRefresh,
  };
};

/**
 * Hook for using cache data with REST API fallback
 * Falls back to REST API if WebSocket is not available
 */
export const useCacheData = (sport = 'nba') => {
  const socket = useCacheSocket(sport);
  const [restData, setRestData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fallback to REST API if socket not connected after 3 seconds
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!socket.isConnected && !socket.data) {
        console.log(`[useCacheData] Socket not connected, falling back to REST API...`);
        try {
          const serverUrl = getSocketUrl();
          const response = await fetch(`${serverUrl}/api/cache/${sport}`);
          const result = await response.json();
          if (result.success) {
            setRestData(result.data);
          }
        } catch (err) {
          console.error('[useCacheData] REST fallback failed:', err);
        }
      }
      setIsLoading(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [sport, socket.isConnected, socket.data]);

  // Update loading state when socket data arrives
  useEffect(() => {
    if (socket.data) {
      setIsLoading(false);
    }
  }, [socket.data]);

  const finalData = socket.data || restData;

  return {
    ...socket,
    data: finalData,
    evBets: finalData?.evBets || [],
    matches: finalData?.matches || [],
    stats: finalData?.stats || null,
    progress: socket.progress,
    isLoading,
  };
};

export default useCacheSocket;
