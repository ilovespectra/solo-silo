'use client';

import { useState } from 'react';
import { FaceCluster } from './hooks/useFaceClusters';

interface FaceClusterCardProps {
  cluster: FaceCluster;
  onClick: (cluster: FaceCluster) => void;
  onContextMenu?: (cluster: FaceCluster, x: number, y: number) => void;
  onRotate?: (clusterId: string, rotation: number) => void;
  theme: 'light' | 'dark';
}

export default function FaceClusterCard({ cluster, onClick, onContextMenu, onRotate, theme }: FaceClusterCardProps) {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [showRotateControls, setShowRotateControls] = useState(false);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(cluster, e.clientX, e.clientY);
  };

  const getThumbnailUrl = () => {
    if (!cluster.primary_thumbnail) {
      return null;
    }
    if (cluster.primary_thumbnail.startsWith('data:')) {
      return cluster.primary_thumbnail;
    }
    if (cluster.primary_thumbnail.startsWith('http')) {
      return cluster.primary_thumbnail;
    }
    if (cluster.primary_thumbnail.startsWith('/')) {
      return cluster.primary_thumbnail;
    }
    return `http://127.0.0.1:8000${cluster.primary_thumbnail}`;
  };

  const getRotationClass = () => {
    const rotation = cluster.rotation_override || 0;
    if (rotation === 0) return '';
    if (rotation === 90) return 'rotate-90';
    if (rotation === 180) return 'rotate-180';
    if (rotation === 270) return '-rotate-90';
    return '';
  };

  const handleRotate = (e: React.MouseEvent, direction: 'cw' | 'ccw') => {
    e.stopPropagation();
    const current = cluster.rotation_override || 0;
    let next = current + (direction === 'cw' ? 90 : -90);
    if (next < 0) next = 270;
    if (next >= 360) next = 0;
    onRotate?.(cluster.id, next);
  };

  return (
    <div
      className="flex flex-col items-center cursor-pointer group"
      onClick={() => onClick(cluster)}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setShowRotateControls(true)}
      onMouseLeave={() => setShowRotateControls(false)}
    >
      {/* Circular Thumbnail */}
      <div
        className={`relative w-32 h-32 rounded-full overflow-hidden border-4 transition-all duration-200 group-hover:scale-110 ${
          theme === 'dark'
            ? 'border-gray-700 bg-gray-800'
            : 'border-gray-300 bg-gray-100'
        } ${!cluster.is_hidden ? '' : 'opacity-50'}`}
      >
        {imageLoading && (
          <div
            className={`absolute inset-0 flex items-center justify-center ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
            }`}
          >
            <div className="w-6 h-6 border-2 border-transparent border-t-orange-500 rounded-full animate-spin"></div>
          </div>
        )}

        {!imageError && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getThumbnailUrl() || undefined}
              alt={cluster.name || 'Unknown person'}
            className={`w-full h-full object-cover ${getRotationClass()}`}
            style={{ transformOrigin: 'center' }}
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setImageLoading(false);
              setImageError(true);
            }}
            />
          </>
        )}

        {imageError && (
          <div className="w-full h-full flex items-center justify-center text-3xl bg-gradient-to-br from-purple-400 to-orange-400">
            👤
          </div>
        )}

        {/* Photo Count Badge */}
        <div
          className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
            theme === 'dark' ? 'bg-orange-800' : 'bg-orange-700'
          }`}
        >
          {cluster.photo_count}
        </div>

        {/* Rotate Controls (on hover) */}
        {showRotateControls && !imageError && (
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={(e) => handleRotate(e, 'ccw')}
              className="p-1 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition text-xs shadow-lg"
              title="Rotate left"
            >
              ↶
            </button>
            <button
              onClick={(e) => handleRotate(e, 'cw')}
              className="p-1 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition text-xs shadow-lg"
              title="Rotate right"
            >
              ↷
            </button>
          </div>
        )}

        {/* Low Confidence Indicator */}
        {cluster.confidence_score < 0.7 && !showRotateControls && (
          <div
            className={`absolute bottom-2 left-2 w-3 h-3 rounded-full ${
              theme === 'dark' ? 'bg-yellow-500' : 'bg-yellow-400'
            }`}
            title="Low confidence cluster"
          ></div>
        )}

        {/* Hidden Indicator */}
        {cluster.is_hidden && !showRotateControls && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40">
            <span className="text-white text-xl">👁️‍🗨️</span>
          </div>
        )}
      </div>

      {/* Name Label */}
      <div className="mt-3 text-center max-w-full">
        <p
          className={`text-sm font-semibold truncate px-2 ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}
          title={cluster.name || 'Unnamed'}
        >
          {cluster.name || (
            <span
              className={`italic ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              unnamed
            </span>
          )}
        </p>

        {/* Confidence Score (if low) */}
        {cluster.confidence_score < 0.8 && (
          <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            {Math.round(cluster.confidence_score * 100)}% confident
          </p>
        )}
      </div>
    </div>
  );
}
