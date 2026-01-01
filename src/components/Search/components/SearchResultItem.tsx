/**
 * SearchResultItem Component - Individual search result with feedback buttons
 */

import React, { useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { SearchResult } from '../types';

interface SearchResultItemProps {
  result: SearchResult;
  onConfirm: (imageId: number, imagePath: string) => void;
  onRemove: (imageId: number, imagePath: string) => void;
  onUndo: (imageId: number) => void;
  devMode?: boolean;
  onResultClick?: (mediaId: number) => void;
}

export const SearchResultItem: React.FC<SearchResultItemProps> = ({
  result,
  onConfirm,
  onRemove,
  onUndo,
  devMode = false,
  onResultClick,
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const { theme } = useAppStore();

  const handleConfirm = () => {
    onConfirm(result.id, result.path);
    setShowUndoToast(true);
    setTimeout(() => setShowUndoToast(false), 5000);
  };

  const handleRemove = () => {
    onRemove(result.id, result.path);
    setShowUndoToast(true);
    setTimeout(() => setShowUndoToast(false), 5000);
  };

  const handleUndo = () => {
    onUndo(result.id);
    setShowUndoToast(false);
  };

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);

  const opacity = result.removed ? 'opacity-30' : 'opacity-100';

  const imageBgClass = theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200';
  const keywordBgClass = theme === 'dark' ? 'bg-orange-900 text-orange-200' : 'bg-orange-100 text-orange-700';
  const metadataTextClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-600';
  const metadataSubtextClass = theme === 'dark' ? 'text-gray-500' : 'text-gray-500';
  const toastClass = theme === 'dark' ? 'bg-gray-800/90 text-white' : 'bg-gray-900/90 text-white';
  const devModeBgClass = theme === 'dark' ? 'bg-gray-900/80' : 'bg-gray-900/80';

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
  const imgSrc = `${BACKEND_URL}/api/media/file/${result.id}`;
  
  const formattedDate = result.date_taken
    ? new Date(result.date_taken * 1000).toLocaleDateString()
    : 'unknown date';
  
  return (
    <div className={`relative group transition-opacity duration-200 ${opacity}`}>
      {/* Image Container */}
      <div
        className={`relative w-full aspect-square overflow-hidden rounded-lg ${imageBgClass} cursor-pointer`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (onResultClick) {
            onResultClick(result.id);
          }
        }}
      >
        {/* Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={`result ${result.id}`}
          className={`w-full h-full object-cover transition-transform duration-200 ${
            isHovering ? 'scale-110' : 'scale-100'
          }`}
          style={{
            transform: `scale(${isHovering ? 1.1 : 1}) rotate(${result.rotation || 0}deg)`,
          }}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.style.display = 'none';
          }}
        />

        {/* Overlay on hover */}
        {isHovering && !result.removed && !result.confirmed && (
          <div className="absolute inset-0 bg-black/40 transition-all duration-150" />
        )}

        {/* Confirmed badge */}
        {result.confirmed && (
          <div className="absolute top-2 right-2 bg-green-500/90 rounded-full p-2 text-white">
            <span className="text-sm font-semibold">✓</span>
          </div>
        )}

        {/* Removed overlay */}
        {result.removed && (
          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
            <div className="bg-red-500/90 text-white px-3 py-1 rounded-lg text-sm font-semibold">
              removed
            </div>
          </div>
        )}

        {/* Similarity score (dev mode) */}
        {devMode && result.similarity !== undefined && (
          <div className={`absolute top-2 left-2 ${devModeBgClass} text-white px-2 py-1 rounded text-xs font-mono`}>
            {(result.similarity * 100).toFixed(1)}%
          </div>
        )}

        {/* Action buttons - show on hover */}
        {isHovering && !result.removed && !result.confirmed && (
          <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/20">
            {/* Confirm button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleConfirm();
              }}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 border-2 border-green-400 text-green-400 hover:bg-green-500/30 transition-all duration-150 hover:scale-110"
              title="confirm this result is relevant (ctrl+enter)"
            >
              <span className="text-xl">✓</span>
            </button>

            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemove();
              }}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 border-2 border-red-400 text-red-400 hover:bg-red-500/30 transition-all duration-150 hover:scale-110"
              title="remove this result from search (ctrl+delete)"
            >
              <span className="text-xl">✕</span>
            </button>
          </div>
        )}
      </div>

      {/* Keywords pills (below image) */}
      {result.keywords && result.keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {result.keywords.map((keyword: string, idx: number) => (
            <span
              key={idx}
              className={`inline-block ${keywordBgClass} text-xs px-2 py-1 rounded-full font-medium`}
            >
              {keyword}
            </span>
          ))}
        </div>
      )}

      {/* Undo toast */}
      {showUndoToast && (
        <div className={`absolute bottom-2 left-2 right-2 ${toastClass} px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between`}>
          <span>{result.confirmed ? '✓ Confirmed' : '✕ Removed'}</span>
          <button
            onClick={handleUndo}
            className="ml-2 text-orange-400 hover:text-orange-300 underline text-xs font-semibold"
          >
            undo
          </button>
        </div>
      )}

      {/* Metadata text (optional) */}
      <div className={`mt-2 text-xs ${metadataTextClass}`}>
        <div className="truncate font-medium" title={result.path}>
          {result.path.split('/').pop()}
        </div>
        <div className={`${metadataSubtextClass} mt-1`}>
          match: {Math.round((result.similarity || 0) * 100)}%
        </div>
        {formattedDate && (
          <div className={metadataSubtextClass}>
            {formattedDate}
          </div>
        )}
        {result.camera && (
          <div className={`${metadataSubtextClass} truncate`}>
            {result.camera}
          </div>
        )}
      </div>
    </div>
  );
};

