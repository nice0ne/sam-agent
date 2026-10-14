import React, { useState, useRef, useEffect } from 'react';
import {
  GripVertical,
  CheckCircle2,
  Plus,
  ArrowRight,
  Database,
  X,
  RotateCcw,
  Loader2,
  MousePointerClick,
  Layers,
} from 'lucide-react';
import { ScraperStep, ScraperField, ScrapeProgress } from './types';

export interface ScraperToolbarProps {
  step: ScraperStep;
  matchedCount: number;
  fields: ScraperField[];
  hasNextButton?: boolean;
  scrapeProgress?: ScrapeProgress | null;
  onAddField: () => void;
  onPickNextButton: () => void;
  onExtract: () => void;
  onCancel: () => void;
  onReset: () => void;
}

export const ScraperToolbar: React.FC<ScraperToolbarProps> = ({
  step,
  matchedCount,
  fields,
  hasNextButton,
  scrapeProgress,
  onAddField,
  onPickNextButton,
  onExtract,
  onCancel,
  onReset,
}) => {
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: Math.max(20, (typeof window !== 'undefined' ? window.innerWidth / 2 - 240 : 100)),
    y: 20,
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
      const newX = Math.max(10, Math.min(window.innerWidth - 480, dragStartRef.current.startX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 80, dragStartRef.current.startY + dy));
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
        pointerEvents: 'auto',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
      className="sam-scraper-toolbar"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          background: 'rgba(15, 23, 42, 0.94)',
          color: '#f8fafc',
          borderRadius: '9999px',
          boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(16px)',
          userSelect: 'none',
          fontSize: '12px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
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
          title="Drag to reposition toolbar"
        >
          <GripVertical size={15} />
        </div>

        {/* Brand / Mode Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 8px',
            background: 'rgba(99, 102, 241, 0.2)',
            border: '1px solid rgba(129, 140, 248, 0.3)',
            borderRadius: '9999px',
            color: '#c7d2fe',
            fontWeight: 600,
            fontSize: '11px',
          }}
        >
          <Layers size={13} />
          <span>Visual Scraper</span>
        </div>

        {/* Step 1 State */}
        {step === 'pick-1' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                color: '#e2e8f0',
                fontWeight: 500,
              }}
            >
              <MousePointerClick size={14} style={{ color: '#a855f7' }} />
              <span>Step 1: Click first item (e.g. Title)</span>
            </span>
          </div>
        )}

        {/* Step 2 State */}
        {step === 'pick-2' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                color: '#e2e8f0',
                fontWeight: 500,
              }}
            >
              <MousePointerClick size={14} style={{ color: '#a855f7' }} />
              <span>Step 2: Click second matching item</span>
            </span>
            <button
              type="button"
              onClick={onReset}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#cbd5e1',
                padding: '3px 8px',
                borderRadius: '9999px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
              title="Restart pattern picking"
            >
              <RotateCcw size={11} />
              <span>Reset</span>
            </button>
          </div>
        )}

        {/* Pick Sub-Field State */}
        {step === 'pick-subfield' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                color: '#38bdf8',
                fontWeight: 500,
              }}
            >
              <MousePointerClick size={14} />
              <span>Click element inside any card to add column</span>
            </span>
            <button
              type="button"
              onClick={onReset}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#cbd5e1',
                padding: '3px 8px',
                borderRadius: '9999px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Pick Next Button State */}
        {step === 'pick-next' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                color: '#fbbf24',
                fontWeight: 500,
              }}
            >
              <MousePointerClick size={14} />
              <span>Click the "Next Page" or "Load More" button</span>
            </span>
            <button
              type="button"
              onClick={onReset}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#cbd5e1',
                padding: '3px 8px',
                borderRadius: '9999px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Configured State */}
        {step === 'configured' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Matched Count Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 9px',
                background: 'rgba(16, 185, 129, 0.18)',
                border: '1px solid rgba(52, 211, 153, 0.4)',
                borderRadius: '9999px',
                color: '#34d399',
                fontWeight: 600,
                fontSize: '11px',
              }}
            >
              <CheckCircle2 size={13} />
              <span>✓ {matchedCount} items detected</span>
            </div>

            {/* Field count badge */}
            <div
              style={{
                padding: '3px 7px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '9999px',
                color: '#94a3b8',
                fontSize: '11px',
                fontWeight: 500,
              }}
            >
              {fields.length} {fields.length === 1 ? 'col' : 'cols'}
            </div>

            {/* + Add Field / Column */}
            <button
              type="button"
              onClick={onAddField}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#f1f5f9',
                padding: '4px 9px',
                borderRadius: '9999px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 500,
                transition: 'background 0.15s ease',
              }}
              title="Click an item in the card to add a new column"
            >
              <Plus size={12} />
              <span>+ Add Field</span>
            </button>

            {/* Next Button Setup */}
            <button
              type="button"
              onClick={onPickNextButton}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: hasNextButton
                  ? 'rgba(245, 158, 11, 0.2)'
                  : 'rgba(255, 255, 255, 0.08)',
                border: hasNextButton
                  ? '1px solid rgba(245, 158, 11, 0.4)'
                  : '1px solid rgba(255, 255, 255, 0.12)',
                color: hasNextButton ? '#fde047' : '#cbd5e1',
                padding: '4px 9px',
                borderRadius: '9999px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 500,
              }}
              title="Select the Next page button for multi-page crawling"
            >
              <ArrowRight size={12} />
              <span>{hasNextButton ? 'Next: Set ✓' : 'Next Button'}</span>
            </button>

            {/* Extract Data Button */}
            <button
              type="button"
              onClick={onExtract}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '5px 12px',
                borderRadius: '9999px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
              }}
              title="Extract data and open in Scraper Studio"
            >
              <Database size={12} strokeWidth={2.5} />
              <span>Extract Data</span>
            </button>
          </div>
        )}

        {/* Scraping in progress */}
        {step === 'scraping' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Loader2 size={14} className="animate-spin" style={{ color: '#38bdf8' }} />
            <span style={{ color: '#e2e8f0', fontWeight: 500 }}>
              {scrapeProgress
                ? `Extracting page ${scrapeProgress.page}... ${scrapeProgress.rows} rows collected`
                : 'Extracting data...'}
            </span>
          </div>
        )}

        {/* Divider */}
        <div
          style={{
            width: '1px',
            height: '14px',
            background: 'rgba(255, 255, 255, 0.15)',
            margin: '0 2px',
          }}
        />

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
          title="Close Scraper"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
