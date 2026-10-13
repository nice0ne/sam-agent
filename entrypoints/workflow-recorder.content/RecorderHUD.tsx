import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Check, X, GripVertical, Disc } from 'lucide-react';
import { RecordingStatus } from './types';

export interface RecorderHUDProps {
  status: RecordingStatus;
  stepCount: number;
  onPauseToggle: () => void;
  onFinish: () => void;
  onCancel: () => void;
}

export const RecorderHUD: React.FC<RecorderHUDProps> = ({
  status,
  stepCount,
  onPauseToggle,
  onFinish,
  onCancel,
}) => {
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: Math.max(20, window.innerWidth / 2 - 160),
    y: 24,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: position.x,
      startY: position.y,
    };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const newX = Math.max(10, Math.min(window.innerWidth - 320, dragStartRef.current.startX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 60, dragStartRef.current.startY + dy));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 2147483647,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
      className="sam-recorder-container"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: 'rgba(15, 23, 42, 0.92)',
          color: '#f8fafc',
          borderRadius: '9999px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(12px)',
          userSelect: 'none',
          fontSize: '12px',
          fontWeight: 500,
        }}
      >
        {/* Drag handle */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            color: '#64748b',
            paddingRight: '2px',
          }}
          title="Drag to reposition HUD"
        >
          <GripVertical size={14} />
        </div>

        {/* Status Dot & Counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {status === 'recording' ? (
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                boxShadow: '0 0 8px #ef4444',
              }}
            />
          ) : (
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#eab308',
              }}
            />
          )}

          <span style={{ fontWeight: 600, letterSpacing: '0.02em' }}>
            {status === 'recording' ? 'REC' : 'PAUSED'}
          </span>

          <span
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              padding: '2px 7px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#38bdf8',
            }}
          >
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.15)', margin: '0 2px' }} />

        {/* Pause/Resume Button */}
        <button
          type="button"
          onClick={onPauseToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'transparent',
            border: 'none',
            color: status === 'recording' ? '#cbd5e1' : '#38bdf8',
            padding: '4px 6px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
          }}
          title={status === 'recording' ? 'Pause recording' : 'Resume recording'}
        >
          {status === 'recording' ? <Pause size={13} /> : <Play size={13} />}
          <span>{status === 'recording' ? 'Pause' : 'Resume'}</span>
        </button>

        {/* Finish Button */}
        <button
          type="button"
          onClick={onFinish}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: '#10b981',
            border: 'none',
            color: '#ffffff',
            padding: '4px 10px',
            borderRadius: '9999px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 600,
            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.4)',
          }}
          title="Finish and synthesize workflow into skill"
        >
          <Check size={13} strokeWidth={2.5} />
          <span>Finish</span>
        </button>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={onCancel}
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            padding: '4px',
            borderRadius: '50%',
            cursor: 'pointer',
          }}
          title="Cancel and discard recording"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
};
