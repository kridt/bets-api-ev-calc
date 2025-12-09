// src/components/ConnectionStatus.jsx
// Real-time connection status indicator

import { useState } from 'react';

export default function ConnectionStatus({
  connected,
  isRefreshing,
  lastUpdate,
  connectedClients,
  soundEnabled,
  notificationsEnabled,
  autoReanalyze,
  onToggleSound,
  onToggleNotifications,
  onToggleAutoReanalyze,
  cacheStatus,
  sport = 'nba'
}) {
  const [showSettings, setShowSettings] = useState(false);

  const formatTime = (date) => {
    if (!date) return '--:--';
    return new Date(date).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getTimeSince = (date) => {
    if (!date) return '';
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      {/* Connection Status Dot */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 20,
          background: connected
            ? 'rgba(34, 197, 94, 0.15)'
            : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${connected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connected ? '#22c55e' : '#ef4444',
            boxShadow: connected
              ? '0 0 8px rgba(34, 197, 94, 0.6)'
              : '0 0 8px rgba(239, 68, 68, 0.6)',
            animation: connected ? 'pulse 2s infinite' : 'none',
          }}
        />
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: connected ? '#22c55e' : '#ef4444',
        }}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      {/* Refreshing Indicator */}
      {isRefreshing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 20,
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              border: '2px solid rgba(59, 130, 246, 0.3)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6' }}>
            SYNCING
          </span>
        </div>
      )}

      {/* Cache Time */}
      {cacheStatus && (
        <div
          style={{
            padding: '6px 12px',
            borderRadius: 20,
            background: 'rgba(168, 85, 247, 0.15)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            fontSize: 12,
            color: '#a855f7',
          }}
        >
          <span style={{ opacity: 0.7 }}>Cache: </span>
          <span style={{ fontWeight: 600 }}>
            {formatTime(sport === 'nba' ? cacheStatus.nba?.lastOddsUpdate : cacheStatus.football?.lastOddsUpdate)}
          </span>
        </div>
      )}

      {/* Last Update */}
      {lastUpdate && (
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Updated {getTimeSince(lastUpdate)}
        </span>
      )}

      {/* Connected Clients */}
      {connectedClients > 0 && (
        <span style={{
          fontSize: 11,
          color: '#64748b',
          opacity: 0.7,
        }}>
          {connectedClients} online
        </span>
      )}

      {/* Settings Button */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid rgba(100, 116, 139, 0.3)',
            background: 'rgba(100, 116, 139, 0.15)',
            color: '#94a3b8',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Settings"
        >
          {soundEnabled || notificationsEnabled ? (
            <span style={{ fontSize: 14 }}>
              {soundEnabled ? '🔔' : '🔕'}
            </span>
          ) : (
            <span style={{ fontSize: 14 }}>⚙️</span>
          )}
        </button>

        {/* Settings Dropdown */}
        {showSettings && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 8,
              padding: 12,
              background: 'rgba(30, 41, 59, 0.98)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 12,
              minWidth: 200,
              zIndex: 100,
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
              Notification Settings
            </div>

            {/* Sound Toggle */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 13, color: '#94a3b8' }}>
                🔊 Sound alerts
              </span>
              <div
                onClick={onToggleSound}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  background: soundEnabled ? '#22c55e' : 'rgba(100, 116, 139, 0.3)',
                  padding: 2,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    transform: soundEnabled ? 'translateX(18px)' : 'translateX(0)',
                    transition: 'transform 0.2s',
                  }}
                />
              </div>
            </label>

            {/* Browser Notifications Toggle */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 13, color: '#94a3b8' }}>
                📱 Push notifications
              </span>
              <div
                onClick={onToggleNotifications}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  background: notificationsEnabled ? '#22c55e' : 'rgba(100, 116, 139, 0.3)',
                  padding: 2,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    transform: notificationsEnabled ? 'translateX(18px)' : 'translateX(0)',
                    transition: 'transform 0.2s',
                  }}
                />
              </div>
            </label>

            {/* Auto-Reanalyze Toggle */}
            {onToggleAutoReanalyze && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                  🔄 Auto-reanalyze
                </span>
                <div
                  onClick={onToggleAutoReanalyze}
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    background: autoReanalyze ? '#22c55e' : 'rgba(100, 116, 139, 0.3)',
                    padding: 2,
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: '#fff',
                      transform: autoReanalyze ? 'translateX(18px)' : 'translateX(0)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </div>
              </label>
            )}

            {/* API Status */}
            {cacheStatus && (
              <div style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: 11,
                color: '#64748b',
              }}>
                <div>API calls: {cacheStatus.apiCallsThisHour}/{cacheStatus.maxCallsPerHour}</div>
                <div style={{
                  marginTop: 4,
                  height: 4,
                  background: 'rgba(100, 116, 139, 0.2)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${(cacheStatus.apiCallsThisHour / cacheStatus.maxCallsPerHour) * 100}%`,
                    background: cacheStatus.apiCallsThisHour > 4000 ? '#ef4444' : '#22c55e',
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
