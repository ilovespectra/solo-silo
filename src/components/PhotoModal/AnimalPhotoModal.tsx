'use client';

import { useState } from 'react';
import BasePhotoModal, { PhotoModalProps } from './BasePhotoModal';

interface AnimalCluster {
  id: string;
  name: string;
  photo_count: number;
}

interface AnimalPhotoModalProps extends PhotoModalProps {
  currentClusterId?: string;
  currentClusterName?: string;
  allClusters?: AnimalCluster[];
  onMoveCluster?: (mediaId: string, toClusterId: string) => Promise<void>;
}

export default function AnimalPhotoModal({
  isOpen,
  media,
  currentClusterId,
  currentClusterName,
  allClusters = [],
  onMoveCluster,
  onClose,
  onConfirm,
  onRemove,
  theme = 'dark',
}: AnimalPhotoModalProps) {
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const otherClusters = allClusters.filter((c) => c.id !== currentClusterId);

  const handleMoveToCluster = async (toClusterId: string) => {
    if (!media || !currentClusterId || !onMoveCluster) return;

    setIsMoving(true);
    try {
      await onMoveCluster(media.id, toClusterId);
      setShowMoveDropdown(false);
      setTimeout(onClose, 500);
    } catch (error) {
      console.error('Failed to move photo:', error);
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <BasePhotoModal
      isOpen={isOpen}
      media={media}
      onClose={onClose}
      onConfirm={onConfirm}
      onRemove={onRemove}
      theme={theme}
    >
      {/* Animal-specific actions */}
      <div className="relative">
        <button
          onClick={() => setShowMoveDropdown(!showMoveDropdown)}
          disabled={isMoving || otherClusters.length === 0}
          className="disabled:opacity-50 px-4 py-2 rounded transition font-semibold"
          title="Move to another species cluster"
          style={{
            backgroundColor: 'var(--orange-glow)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)'
          }}
        >
          ↔ Move Species
        </button>

        {/* Dropdown menu */}
        {showMoveDropdown && otherClusters.length > 0 && (
          <div className="absolute bottom-full right-0 mb-2 rounded shadow-lg z-20 min-w-48 max-h-64 overflow-y-auto" style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
            border: '1px solid var(--border-primary)'
          }}>
            <div className="p-1">
              {otherClusters.map((cluster) => (
                <button
                  key={cluster.id}
                  onClick={() => handleMoveToCluster(cluster.id)}
                  disabled={isMoving}
                  className="w-full text-left px-3 py-2 rounded transition text-sm disabled:opacity-50"
                  style={{
                    color: 'var(--text-primary)'
                  }}
                >
                  <div className="font-medium">{cluster.name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {cluster.photo_count} photos
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {otherClusters.length === 0 && (
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Only 1 species available</div>
        )}
      </div>
    </BasePhotoModal>
  );
}
