'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { VirtualFolder } from '@/types';

interface AddToFolderContextMenuProps {
  x: number;
  y: number;
  selectedResultIds: number[];
  onClose: () => void;
  onFolderPlacementSuccess?: (fileCount: number, folderName: string) => void;
}

export const AddToFolderContextMenu: React.FC<AddToFolderContextMenuProps> = ({
  x,
  y,
  selectedResultIds,
  onClose,
  onFolderPlacementSuccess,
}) => {
  const { theme, folders, rootFolderIds, addMediaToFolder, createFolder } = useAppStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('New Folder');
  const [adding, setAdding] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sortedFolders = React.useMemo(() => {
    const allFolders = rootFolderIds
      .map(id => folders[id])
      .filter((f): f is VirtualFolder => f !== undefined)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return allFolders.slice(0, 5);
  }, [folders, rootFolderIds]);

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isCreating]);

  const handleAddToFolder = async (folderId: string) => {
    if (adding || selectedResultIds.length === 0) {
      console.warn('cannot add to folder:', { adding, selectedResultIds });
      return;
    }
    
    console.log('adding to folder:', { folderId, selectedResultIds });
    setAdding(true);
    try {
      const folder = folders[folderId];
      const folderName = folder?.name || 'Folder';
      
      await addMediaToFolder(folderId, selectedResultIds);
      console.log('successfully added to folder');
      
      if (onFolderPlacementSuccess) {
        onFolderPlacementSuccess(selectedResultIds.length, folderName);
      }
      
      onClose();
    } catch (error) {
      console.error('failed to add media to folder:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleCreateAndAdd = async () => {
    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      console.log('empty folder name, canceling');
      setIsCreating(false);
      setNewFolderName('new folder');
      return;
    }

    console.log('creating folder and adding media:', { trimmedName, selectedResultIds, count: selectedResultIds.length });
    setAdding(true);
    try {
      const folder = await createFolder(trimmedName);
      console.log('folder created successfully:', folder);
      await addMediaToFolder(folder.id, selectedResultIds);
      console.log('media added to new folder successfully');
      
      if (onFolderPlacementSuccess) {
        onFolderPlacementSuccess(selectedResultIds.length, trimmedName);
      }
      
      setNewFolderName('new folder');
      setIsCreating(false);
      onClose();
    } catch (error) {
      console.error('failed to create folder or add media:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to create folder'}`);
    } finally {
      setAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateAndAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsCreating(false);
      setNewFolderName('new folder');
    }
  };

  const bgClass = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
  const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
  const textClass = theme === 'dark' ? 'text-gray-200' : 'text-gray-900';
  const hoverClass = theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100';
  const dividerClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';

  return (
    <div
      ref={menuRef}
      className={`fixed z-[9999] ${bgClass} border ${borderClass} rounded-lg shadow-xl min-w-max`}
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="py-1">
        {/* Header */}
        <div className={`px-4 py-2 text-xs font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          add {selectedResultIds.length} {selectedResultIds.length === 1 ? 'image' : 'images'} to
        </div>

        {/* Recent Folders */}
        {sortedFolders.length > 0 && (
          <>
            {sortedFolders.map(folder => (
              <button
                key={folder.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddToFolder(folder.id);
                }}
                disabled={adding}
                className={`block w-full text-left px-4 py-2 text-sm ${textClass} ${hoverClass} disabled:opacity-50 disabled:cursor-not-allowed transition`}
              >
                📁 {folder.name}
                <span className={`ml-2 text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                  ({folder.mediaIds.length})
                </span>
              </button>
            ))}
            <div className={`border-t ${dividerClass}`} />
          </>
        )}

        {/* Create New Folder */}
        {!isCreating && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              console.log('Create new folder button clicked');
              setIsCreating(true);
            }}
            className={`block w-full text-left px-4 py-2 text-sm ${textClass} ${hoverClass} transition`}
          >
            ➕ create new folder
          </button>
        )}

        {/* Create Folder Input */}
        {isCreating && (
          <div className="px-4 py-2 border-t border-b">
            <input
              ref={inputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (!adding) {
                  setIsCreating(false);
                  setNewFolderName('new folder');
                }
              }}
              placeholder="folder name..."
              className={`w-full px-2 py-1 text-sm rounded border ${
                theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-gray-50 border-gray-300 text-gray-900'
              }`}
              disabled={adding}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateAndAdd();
                }}
                disabled={adding}
                className={`flex-1 px-2 py-1 text-xs font-medium rounded transition ${
                  theme === 'dark'
                    ? 'bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50'
                    : 'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50'
                }`}
              >
                {adding ? 'adding...' : 'create & add'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreating(false);
                  setNewFolderName('New Folder');
                }}
                disabled={adding}
                className={`flex-1 px-2 py-1 text-xs font-medium rounded transition ${
                  theme === 'dark'
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50'
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300 disabled:opacity-50'
                }`}
              >
                cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
