'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';

interface VirtualScrollProps {
  items: any[];
  itemHeight: number;
  renderItem: (item: any, index: number) => React.ReactNode;
  containerHeight: number;
  overscan?: number;
  className?: string;
  onScroll?: (scrollTop: number) => void;
  gridCols?: number;
  gap?: number;
}

/**
 * VirtualScroll Component
 * 
 * Renders large lists efficiently by only rendering visible items.
 * Supports both list and grid layouts.
 * 
 * Props:
 * - items: Array of items to render
 * - itemHeight: Height of each item in pixels
 * - renderItem: Function to render each item
 * - containerHeight: Height of the viewport
 * - overscan: Number of items to render outside visible area (default: 5)
 * - gridCols: Number of grid columns (optional, for grid layout)
 * - gap: Gap between items in pixels
 * - onScroll: Callback when scroll position changes
 */
export const VirtualScroll: React.FC<VirtualScrollProps> = ({
  items,
  itemHeight,
  renderItem,
  containerHeight,
  overscan = 5,
  className = '',
  onScroll,
  gridCols,
  gap = 0,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, i) => ({
      item,
      index: startIndex + i,
    }));
  }, [items, startIndex, endIndex]);

  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const newScrollTop = e.currentTarget.scrollTop;
      setScrollTop(newScrollTop);
      onScroll?.(newScrollTop);
    },
    [onScroll]
  );

  return (
    <div
      ref={scrollContainerRef}
      className={className}
      style={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative',
      }}
      onScroll={handleScroll}
    >
      {/* Spacer container */}
      <div
        style={{
          height: totalHeight,
          position: 'relative',
        }}
      >
        {/* Visible items container */}
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {gridCols ? (
            // Grid layout
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                gap: `${gap}px`,
                padding: `${gap}px`,
              }}
            >
              {visibleItems.map(({ item, index }) => (
                <div key={index}>{renderItem(item, index)}</div>
              ))}
            </div>
          ) : (
            // List layout
            <>
              {visibleItems.map(({ item, index }) => (
                <div key={index} style={{ height: itemHeight }}>
                  {renderItem(item, index)}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VirtualScroll;
