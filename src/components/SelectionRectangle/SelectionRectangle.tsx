import React from 'react';

interface RectangleBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SelectionRectangleProps {
  isActive: boolean;
  bounds: RectangleBounds | null;
  itemCount?: number;
}
export const SelectionRectangle: React.FC<SelectionRectangleProps> = ({
  isActive,
  bounds,
  itemCount = 0,
}) => {
  if (!isActive || !bounds) {
    return null;
  }

  const rectStyle = {
    position: 'fixed' as const,
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    backgroundColor: 'rgba(255, 102, 0, 0.1)',
    border: '2px solid rgba(255, 111, 0, 1)',
    borderRadius: '4px',
    pointerEvents: 'none' as const,
    zIndex: 9999,
    boxShadow: 'inset 0 0 4px rgba(220, 126, 26, 0.3)',
  };

  return (
    <div
      className="selection-rectangle"
      style={rectStyle}
    >
      {itemCount > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '4px',
            backgroundColor: 'rgba(255, 139, 44, 0.29)',
            color: 'white',
            padding: '2px 6px',
            borderRadius: '3px',
            fontSize: '12px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
          }}
        >
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default SelectionRectangle;
