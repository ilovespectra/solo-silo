'use client';

import React, { useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';

interface RemoveFromFolderContextMenuProps {
  x: number;
  y: number;
  mediaIds: number[];
  folderId: string;
  folderName: string;
  onClose: () => void;
}

export const RemoveFromFolderContextMenu: React.FC<RemoveFromFolderContextMenuProps> = ({
  x,
  y,
  mediaIds,
  folderId,
  folderName,
  onClose,
}) => {
  const { theme, removeMediaFromFolder } = useAppStore();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        e.preventDefault();
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onClose]);

  const handleRemoveFromFolder = async () => {
    try {
      await removeMediaFromFolder(folderId, mediaIds);
      console.log(`[RemoveFromFolder] successfully removed ${mediaIds.length} items from "${folderName}"`);
      onClose();
    } catch (error) {
      console.error('[RemoveFromFolder] failed to remove media from folder:', error);
    }
  };

  const bgClass = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
  const textClass = theme === 'dark' ? 'text-gray-200' : 'text-gray-900';
  const hoverClass = theme === 'dark' ? 'hover:bg-red-900 hover:bg-opacity-50' : 'hover:bg-red-50';
  const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
  const textMutedClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-600';

  return (
    <div
      ref={menuRef}
      className={`fixed ${bgClass} rounded-lg shadow-xl border ${borderClass} z-50 min-w-max overflow-hidden`}
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className={`${textClass}`}>
        <div className="px-4 py-3 border-b border-gray-600">
          <div className="text-sm font-semibold">
            {mediaIds.length} item{mediaIds.length !== 1 ? 's' : ''} selected
          </div>
          <div className={`text-xs ${textMutedClass} mt-1`}>
            from &quot;{folderName}&quot;
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRemoveFromFolder();
          }}
          className={`w-full text-left px-4 py-3 text-sm font-medium transition flex items-center gap-3 ${hoverClass}`}
        >
          <span className="text-lg">🗑️</span>
          <span>remove</span>
        </button>
      </div>
    </div>
  );
};
