import React from 'react';

export function DemoBanner() {
  return (
    <div
      style={{
        backgroundColor: '#fef3c7',
        borderBottom: '1px solid #f59e0b',
        padding: '0.75rem 1rem',
        textAlign: 'center',
        fontSize: '0.875rem',
        color: '#92400e',
        fontWeight: 500,
      }}
    >
      <span style={{ marginRight: '0.5rem' }}>🎯</span>
      Demo Mode - Read Only
      <span style={{ marginLeft: '0.5rem', opacity: 0.8 }}>
        (This is a public demonstration. Some features are disabled.)
      </span>
    </div>
  );
}
