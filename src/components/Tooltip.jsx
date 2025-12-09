// src/components/Tooltip.jsx
// Beautiful animated tooltip component

import { useState, useRef, useEffect } from 'react';

const Tooltip = ({ children, text, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const trigger = triggerRef.current.getBoundingClientRect();
      const tooltip = tooltipRef.current.getBoundingClientRect();

      let x = 0, y = 0;

      switch (position) {
        case 'top':
          x = trigger.left + trigger.width / 2 - tooltip.width / 2;
          y = trigger.top - tooltip.height - 10;
          break;
        case 'bottom':
          x = trigger.left + trigger.width / 2 - tooltip.width / 2;
          y = trigger.bottom + 10;
          break;
        case 'left':
          x = trigger.left - tooltip.width - 10;
          y = trigger.top + trigger.height / 2 - tooltip.height / 2;
          break;
        case 'right':
          x = trigger.right + 10;
          y = trigger.top + trigger.height / 2 - tooltip.height / 2;
          break;
      }

      // Keep tooltip within viewport
      x = Math.max(10, Math.min(x, window.innerWidth - tooltip.width - 10));
      y = Math.max(10, Math.min(y, window.innerHeight - tooltip.height - 10));

      setCoords({ x, y });
    }
  }, [isVisible, position]);

  const arrowStyles = {
    top: {
      bottom: -6,
      left: '50%',
      transform: 'translateX(-50%) rotate(45deg)',
    },
    bottom: {
      top: -6,
      left: '50%',
      transform: 'translateX(-50%) rotate(45deg)',
    },
    left: {
      right: -6,
      top: '50%',
      transform: 'translateY(-50%) rotate(45deg)',
    },
    right: {
      left: -6,
      top: '50%',
      transform: 'translateY(-50%) rotate(45deg)',
    },
  };

  return (
    <>
      <span
        ref={triggerRef}
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </span>

      {isVisible && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            zIndex: 99999,
            pointerEvents: 'none',
            animation: 'tooltipFadeIn 0.2s ease-out',
          }}
        >
          <div
            style={{
              position: 'relative',
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: 12,
              padding: '12px 16px',
              fontSize: 13,
              color: '#e2e8f0',
              maxWidth: 280,
              lineHeight: 1.5,
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(99, 102, 241, 0.15)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {/* Glow effect */}
            <div
              style={{
                position: 'absolute',
                inset: -1,
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.1))',
                zIndex: -1,
                filter: 'blur(8px)',
              }}
            />

            {/* Arrow */}
            <div
              style={{
                position: 'absolute',
                width: 12,
                height: 12,
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRight: 'none',
                borderBottom: 'none',
                ...arrowStyles[position],
              }}
            />

            {/* Content */}
            <div style={{ position: 'relative' }}>
              {text}
            </div>
          </div>

          {/* Inject keyframes animation */}
          <style>{`
            @keyframes tooltipFadeIn {
              from {
                opacity: 0;
                transform: translateY(${position === 'bottom' ? '-8px' : position === 'top' ? '8px' : '0'})
                           translateX(${position === 'right' ? '-8px' : position === 'left' ? '8px' : '0'});
              }
              to {
                opacity: 1;
                transform: translateY(0) translateX(0);
              }
            }
          `}</style>
        </div>
      )}
    </>
  );
};

// Help icon with tooltip - beautiful glowing icon
export const HelpTooltip = ({ text, position = 'top' }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Tooltip text={text} position={position}>
      <span
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: isHovered
            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(168, 85, 247, 0.3))'
            : 'rgba(100, 116, 139, 0.25)',
          border: isHovered
            ? '1px solid rgba(99, 102, 241, 0.5)'
            : '1px solid rgba(100, 116, 139, 0.3)',
          color: isHovered ? '#a5b4fc' : '#94a3b8',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'help',
          marginLeft: 6,
          transition: 'all 0.2s ease',
          boxShadow: isHovered
            ? '0 0 12px rgba(99, 102, 241, 0.3)'
            : 'none',
        }}
      >
        ?
      </span>
    </Tooltip>
  );
};

export default Tooltip;
