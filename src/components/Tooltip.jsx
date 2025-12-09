// src/components/Tooltip.jsx
// Reusable tooltip component for help text

import { useState } from 'react';

const Tooltip = ({ children, text, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionStyles = {
    top: {
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginBottom: 8,
    },
    bottom: {
      top: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginTop: 8,
    },
    left: {
      right: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      marginRight: 8,
    },
    right: {
      left: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      marginLeft: 8,
    },
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          style={{
            position: 'absolute',
            ...positionStyles[position],
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: '#e2e8f0',
            whiteSpace: 'nowrap',
            maxWidth: 300,
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            lineHeight: 1.4,
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
};

// Help icon with tooltip
export const HelpTooltip = ({ text, position = 'top' }) => (
  <Tooltip text={text} position={position}>
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: 'rgba(100, 116, 139, 0.3)',
        color: '#94a3b8',
        fontSize: 10,
        fontWeight: 700,
        cursor: 'help',
        marginLeft: 4,
      }}
    >
      ?
    </span>
  </Tooltip>
);

export default Tooltip;
