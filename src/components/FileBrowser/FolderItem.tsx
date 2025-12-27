'use client';

import { useState, useRef, useEffect } from 'react';
import { VirtualFolder } from '@/types';
import { useAppStore } from '@/store/appStore';

interface FolderItemProps {
  folder: VirtualFolder;
  onRename?: (newName: string) => void;
  onDelete?: () => void;
  onDownloadZip?: () => void;
  onClick?: (folderId: string) => void;
  onDoubleClick?: (folderId: string) => void;
  onMediaDropped?: (mediaIds: number[]) => Promise<void>;
}

export default function FolderItem({
  folder,
  onRename,
  onDelete,
  onDownloadZip,
  onClick,
  onDoubleClick,
  onMediaDropped,
}: FolderItemProps) {
  const { theme } = useAppStore();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(folder.name);
  const [showMenu, setShowMenu] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastClickTime, setLastClickTime] = useState(0);
  const dragOverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    
    const timeoutId = dragOverTimeoutRef.current;
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const handleRenameSubmit = () => {
    if (newName.trim() && newName !== folder.name) {
      onRename?.(newName.trim());
    }
    setIsRenaming(false);
  };

  const handleDelete = () => {
    if (confirm(`delete folder "${folder.name}"? (files will not be deleted, only removed from this folder)`)) {
      onDelete?.();
    }
    setShowMenu(false);
  };

  const handleDownloadZip = () => {
    onDownloadZip?.();
    setShowMenu(false);
  };

  const handleFolderClick = () => {
    console.log('[FolderItem] click detected on:', folder.name, 'lastClickTime:', lastClickTime);
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime;
    console.log('[FolderItem] time since last click:', timeSinceLastClick);

    if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
      console.log('[FolderItem] double-click detected!');
      onDoubleClick?.(folder.id);
    } else {
      console.log('[FolderItem] single click');
      onClick?.(folder.id);
    }

    setLastClickTime(now);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    
    if (!isDragOver) {
      setIsDragOver(true);
      setDropError(null);
    }

    if (dragOverTimeoutRef.current) {
      clearTimeout(dragOverTimeoutRef.current);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    setDropError(null);
    
    try {
      const mediaData = e.dataTransfer.getData('application/json');
      if (mediaData) {
        const data = JSON.parse(mediaData);
        if (data.type === 'media' && data.mediaIds && data.mediaIds.length > 0) {
          console.log('[FolderItem] media dropped on folder:', folder.id, 'Media IDs:', data.mediaIds);
          
          if (onMediaDropped) {
            await onMediaDropped(data.mediaIds);
            
            setIsDragOver(false);
            setTimeout(() => {
            }, 300);
          } else {
            const res = await fetch(`/api/folders/${folder.id}/add-media`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mediaIds: data.mediaIds }),
            });

            if (res.ok) {
              console.log('[FolderItem] successfully added media to folder');
              
              setIsDragOver(false);
              setTimeout(() => {
              }, 300);
            } else {
              const error = await res.text();
              console.error(`[FolderItem] failed to add media: ${res.status} ${error}`);
              setDropError(`failed: ${res.status}`);
              
              setTimeout(() => {
                setIsDragOver(false);
              }, 1500);
            }
          }
          return;
        }
      }
    } catch (err) {
      console.error('[FolderItem] error handling drop:', err);
      setDropError('drop failed');
      
      setTimeout(() => {
        setIsDragOver(false);
      }, 1500);
    }
  };

  return (
    <div
      ref={dropZoneRef}
      data-folder-id={folder.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', folder.id);
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !isRenaming && handleFolderClick()}
      className={`flex flex-col items-center cursor-pointer group relative transition-all ${
        isRenaming ? '' : 'hover:opacity-80'
      } ${isDragOver ? 'opacity-100' : ''}`}
    >
      {/* Folder Icon Container */}
      <div
        className={`relative w-32 h-32 rounded-lg border-2 flex items-center justify-center transition-all duration-150 ${
          dropError
            ? theme === 'dark'
              ? 'border-red-500 bg-red-900 bg-opacity-40 ring-2 ring-red-400'
              : 'border-red-500 bg-red-100 bg-opacity-60 ring-2 ring-red-400'
            : isDragOver
            ? theme === 'dark'
              ? 'border-green-500 bg-green-900 bg-opacity-40 ring-2 ring-green-400 scale-105'
              : 'border-green-500 bg-green-100 bg-opacity-60 ring-2 ring-green-400 scale-105'
            : theme === 'dark'
            ? 'border-orange-600 bg-orange-900 bg-opacity-20'
            : 'border-orange-400 bg-orange-100 bg-opacity-50'
        }`}
      >
        {/* Folder Icon */}
        <div className="text-6xl">📁</div>

        {/* Item Count Badge */}
        <div
          className={`absolute -bottom-2 -right-2 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold transition-colors ${
            dropError
              ? theme === 'dark'
                ? 'bg-red-600 text-white'
                : 'bg-red-400 text-white'
              : isDragOver
              ? theme === 'dark'
                ? 'bg-green-600 text-white'
                : 'bg-green-500 text-white'
              : theme === 'dark'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-300 text-gray-900'
          }`}
        >
          {folder.mediaIds.length}
        </div>

        {/* Drop Status Indicator */}
        {isDragOver && !dropError && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-green-500 bg-opacity-20 pointer-events-none">
            <span className="text-sm font-semibold text-green-700 dark:text-green-300">drop here!</span>
          </div>
        )}

        {/* Error Status Indicator */}
        {dropError && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-red-500 bg-opacity-20 pointer-events-none">
            <span className="text-sm font-semibold text-red-700 dark:text-red-300">{dropError}</span>
          </div>
        )}

        {/* Context Menu Button */}
        <button
          ref={buttonRef}
          onClick={(e) => {
            e.stopPropagation();
            if (!showMenu && buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              setMenuPosition({
                top: rect.bottom + 8,
                left: rect.left,
              });
            }
            setShowMenu(!showMenu);
          }}
          className={`absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition ${
            theme === 'dark'
              ? 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          ⋮
        </button>
      </div>

      {/* Folder Name */}
      <div className="w-32 mt-3">
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full px-2 py-1 text-center text-sm font-medium rounded border ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-600 text-white'
                : 'bg-white border-gray-300 text-gray-900'
            }`}
          />
        ) : (
          <p
            className={`text-center text-sm font-medium truncate ${
              theme === 'dark' ? 'text-gray-200' : 'text-gray-900'
            }`}
          >
            {folder.name}
          </p>
        )}
      </div>

      {/* Context Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className={`fixed rounded-lg shadow-2xl border ${
            theme === 'dark'
              ? 'bg-gray-800 border-gray-700'
              : 'bg-white border-gray-200'
          } z-[9999] min-w-max`}
          style={{
            top: `${Math.min(menuPosition.top, window.innerHeight - 200)}px`,
            left: `${Math.max(8, Math.min(menuPosition.left, window.innerWidth - 200))}px`,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              setIsRenaming(true);
            }}
            className={`block w-full text-left px-4 py-2 text-sm hover:bg-opacity-20 transition lowercase ${
              theme === 'dark'
                ? 'text-gray-200 hover:bg-orange-600'
                : 'text-gray-900 hover:bg-orange-200'
            }`}
          >
            ✏️ rename
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownloadZip();
            }}
            className={`block w-full text-left px-4 py-2 text-sm hover:bg-opacity-20 transition lowercase ${
              theme === 'dark'
                ? 'text-gray-200 hover:bg-green-600'
                : 'text-gray-900 hover:bg-green-200'
            }`}
          >
            ⬇️ download as zip
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className={`block w-full text-left px-4 py-2 text-sm hover:bg-opacity-20 transition lowercase ${
              theme === 'dark'
                ? 'text-red-400 hover:bg-red-600'
                : 'text-red-600 hover:bg-red-200'
            }`}
          >
            🗑️ delete
          </button>
        </div>
      )}
    </div>
  );
}
