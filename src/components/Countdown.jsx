// src/components/Countdown.jsx
import { useState, useEffect } from 'react';

export default function Countdown({ targetDate, compact = false }) {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft(targetDate));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(targetDate));
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  function calculateTimeLeft(target) {
    if (!target) return null;

    const now = new Date().getTime();
    const targetTime = new Date(target).getTime();
    const difference = targetTime - now;

    if (difference <= 0) {
      return { expired: true };
    }

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, expired: false };
  }

  if (!timeLeft || timeLeft.expired) {
    return (
      <div style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        fontSize: compact ? 11 : 12,
        color: '#10b981',
        fontWeight: 600,
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#10b981',
          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        }} />
        LIVE NOW
      </div>
    );
  }

  const { days, hours, minutes, seconds } = timeLeft;

  // Compact inline format
  if (compact) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 13,
        fontWeight: 600,
        color: '#e2e8f0',
        background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)',
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid rgba(102, 126, 234, 0.3)',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {days > 0 && `${days}d `}
          {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
      </div>
    );
  }

  // Box format (original)
  return (
    <div style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    }}>
      {days > 0 && (
        <TimeUnit value={days} label={days === 1 ? 'day' : 'days'} />
      )}
      <TimeUnit value={hours} label="h" />
      <TimeUnit value={minutes} label="m" />
      <TimeUnit value={seconds} label="s" />
    </div>
  );
}

function TimeUnit({ value, label }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '6px 10px',
        borderRadius: 8,
        fontSize: 16,
        fontWeight: 700,
        minWidth: 40,
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
      }}>
        {String(value).padStart(2, '0')}
      </div>
      <div style={{
        fontSize: 10,
        color: '#94a3b8',
        fontWeight: 500,
        textTransform: 'uppercase',
      }}>
        {label}
      </div>
    </div>
  );
}
