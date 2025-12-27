/**
 * AnimalClusterCard Component - Circular animal thumbnail card
 */

import React, { useState } from 'react';
import type { AnimalCluster } from '@/components/Animals/types';
import {
  getSpeciesEmoji,
  getCategoryEmoji,
  getConfidenceColor,
  getConfidenceLabel,
} from '@/components/Animals/utils/species';

interface AnimalClusterCardProps {
  animal: AnimalCluster;
  onSelect: (animal: AnimalCluster) => void;
  onContextMenu?: (animal: AnimalCluster, e: React.MouseEvent) => void;
  selected?: boolean;
  showDetails?: boolean;
}

export const AnimalClusterCard: React.FC<AnimalClusterCardProps> = ({
  animal,
  onSelect,
  onContextMenu,
  selected = false,
  showDetails = true,
}) => {
  const [isHovering, setIsHovering] = useState(false);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(animal, e);
  };

  const confidenceColor = getConfidenceColor(animal.detection_confidence);
  const confidenceLabel = getConfidenceLabel(animal.detection_confidence);

  return (
    <div
      className="flex flex-col items-center gap-3 p-4 rounded-lg hover:bg-gray-50 transition-colors"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onContextMenu={handleContextMenu}
    >
      {/* Circular Thumbnail Container */}
      <div
        className={`relative w-24 h-24 rounded-full overflow-hidden cursor-pointer border-2 transition-all duration-200 ${
          selected
            ? 'border-orange-500 bg-orange-50 scale-105'
            : confidenceColor
        } ${isHovering ? 'scale-110 shadow-lg' : ''}`}
        onClick={() => onSelect(animal)}
      >
        {/* Thumbnail Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={animal.primary_thumbnail}
          alt={animal.name || 'Unknown Animal'}
          className="w-full h-full object-cover"
        />

        {/* Species Emoji Overlay */}
        <div className="absolute top-1 right-1 text-2xl bg-white/80 rounded-full w-8 h-8 flex items-center justify-center">
          {getSpeciesEmoji(animal.species)}
        </div>

        {/* Confidence Badge */}
        {!isHovering && (
          <div
            className={`absolute bottom-1 left-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
              animal.detection_confidence >= 0.85
                ? 'bg-green-100 text-green-700'
                : animal.detection_confidence >= 0.7
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
            }`}
          >
            {confidenceLabel}
          </div>
        )}

        {/* Hover Actions */}
        {isHovering && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(animal);
              }}
              className="p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
              title="View details"
            >
              <span className="text-sm">👁️</span>
            </button>
          </div>
        )}

        {/* Multiple Animals Badge */}
        {animal.photo_count > 1 && (
          <div className="absolute top-1 left-1 bg-orange-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
            {Math.min(animal.photo_count, 99)}
          </div>
        )}
      </div>

      {/* Name and Info */}
      {showDetails && (
        <div className="text-center w-full">
          <div className="text-sm font-semibold text-gray-900 truncate">
            {animal.name || 'Unnamed Animal'}
          </div>

          {/* Species and Category */}
          <div className="flex items-center justify-center gap-1 text-xs text-gray-600 mt-1">
            {animal.species && (
              <span title={animal.species}>{getSpeciesEmoji(animal.species)}</span>
            )}
            {animal.category && animal.category !== 'unknown' && (
              <span title={animal.category}>{getCategoryEmoji(animal.category)}</span>
            )}
          </div>

          {/* Photo Count */}
          <div className="text-xs text-gray-500 mt-1">
            {animal.photo_count} photo{animal.photo_count !== 1 ? 's' : ''}
          </div>

          {/* Confidence Percentage */}
          <div className="text-xs text-gray-500">
            {Math.round(animal.detection_confidence * 100)}% confident
          </div>
        </div>
      )}
    </div>
  );
};
