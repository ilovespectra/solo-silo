'use client';

import React, { useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';

interface SelectedMediaActionModalProps {
  isOpen: boolean;
  mediaIds: number[];
  folderId: string;
  folderName: string;
  x: number;
  y: number;
  onClose: () => void;
  onRemove?: () => void;
  onFavorite?: () => void;
}

export const SelectedMediaActionModal: React.FC<SelectedMediaActionModalProps> = ({
  isOpen,
  mediaIds,
  folderId,
  folderName,
  x,
  y,
  onClose,
  onRemove,
  onFavorite,
}) => {
  const { theme, removeMediaFromFolder } = useAppStore();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', (e) => e.preventDefault());
    };
  }, [isOpen, onClose]);

  if (!isOpen || mediaIds.length === 0) return null;

  const handleRemoveFromFolder = async () => {
    try {
      await removeMediaFromFolder(folderId, mediaIds);
      console.log(`[SelectedMediaActionModal] Successfully removed ${mediaIds.length} items from "${folderName}"`);
      onRemove?.();
      onClose();
    } catch (error) {
      console.error('[SelectedMediaActionModal] Failed to remove media from folder:', error);
    }
  };

  const handleFavorite = async () => {
    console.log(`[SelectedMediaActionModal] Favorite feature coming soon for ${mediaIds.length} items`);
    onFavorite?.();
    onClose();
  };

  const bgClass = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
  const textClass = theme === 'dark' ? 'text-gray-200' : 'text-gray-900';
  const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
  const textMutedClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-600';
  const hoverBgRemove = theme === 'dark' ? 'hover:bg-red-900 hover:bg-opacity-50' : 'hover:bg-red-50';
  const hoverBgFav = theme === 'dark' ? 'hover:bg-yellow-900 hover:bg-opacity-50' : 'hover:bg-yellow-50';

  let adjustedX = x - 150;
  let adjustedY = y;

  if (adjustedX < 10) adjustedX = 10;
  if (adjustedY < 10) adjustedY = 10;

  return (
    <>
      <div className="fixed inset-0 z-40" onContextMenu={(e) => e.preventDefault()} />

      {/* Action Modal */}
      <div
        ref={modalRef}
        className={`fixed ${bgClass} rounded-lg shadow-2xl border ${borderClass} z-50 overflow-hidden min-w-max`}
        style={{
          left: `${adjustedX}px`,
          top: `${adjustedY}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className={`${textClass}`}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-600 bg-opacity-50">
            <div className="text-sm font-semibold">
              {mediaIds.length} item{mediaIds.length !== 1 ? 's' : ''} selected
            </div>
            <div className={`text-xs ${textMutedClass} mt-1`}>
              from &quot;{folderName}&quot;
            </div>
          </div>

          {/* Actions */}
          <div className="py-1">
            {/* Favorite Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleFavorite();
              }}
              className={`w-full text-left px-4 py-3 text-sm font-medium transition flex items-center gap-3 ${hoverBgFav}`}
              title="Mark as favorite (coming soon)"
            >
              <span className="text-lg">⭐</span>
              <span>Favorite</span>
            </button>

            {/* Divider */}
            <div className={`border-t ${borderClass}`}></div>

            {/* Remove Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveFromFolder();
              }}
              className={`w-full text-left px-4 py-3 text-sm font-medium transition flex items-center gap-3 ${hoverBgRemove}`}
              title="Remove from this folder"
            >
              <span className="text-lg">🗑️</span>
              <span>Remove</span>
            </button>

            {/* Divider */}
            <div className={`border-t ${borderClass}`}></div>

            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className={`w-full text-left px-4 py-3 text-sm font-medium transition flex items-center gap-3 ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              title="Close menu (ESC)"
            >
              <span className="text-lg">✕</span>
              <span>Close</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
