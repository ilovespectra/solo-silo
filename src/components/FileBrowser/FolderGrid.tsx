'use client';
import { apiUrl } from '@/lib/api';

import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { VirtualFolder } from '@/types';
import FolderItem from './FolderItem';

interface FolderGridProps {
  onMediaDropped?: (folderId: string, mediaIds: number[]) => Promise<void>;
}

export default function FolderGrid({ onMediaDropped }: FolderGridProps) {
  const { folders, rootFolderIds, theme, renameFolder, deleteFolder, createFolder, isCreatingFolder, setIsCreatingFolder, navigateToFolder, currentFolderId } = useAppStore();
  const [newFolderName, setNewFolderName] = useState('New Folder');
  const inputRef = useRef<HTMLInputElement>(null);

  const folderIds = currentFolderId
    ? Object.values(folders)
        .filter((f) => f?.parentId === currentFolderId)
        .map((f) => f?.id)
        .filter((id): id is string => id !== undefined)
    : rootFolderIds;

  const displayFolders = folderIds
    .map((id: string) => folders[id])
    .filter((f: VirtualFolder | undefined): f is VirtualFolder => f !== undefined);

  console.log('[FolderGrid] Render:', {
    currentFolderId,
    rootFolderIds,
    allFolders: Object.values(folders).map(f => ({ id: f?.id, name: f?.name, parentId: f?.parentId })),
    folderIds,
    displayFolders: displayFolders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId }))
  });

  useEffect(() => {
    if (isCreatingFolder && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isCreatingFolder]);

  const handleCreateFolder = async () => {
    const trimmedName = newFolderName.trim();
    if (trimmedName) {
      try {
        console.log('[FolderGrid] Creating folder:', trimmedName, 'with parentId:', currentFolderId);
        await createFolder(trimmedName, currentFolderId || undefined);
        setNewFolderName('New Folder');
      } catch (error) {
        console.error('Failed to create folder:', error);
      }
    } else {
      setIsCreatingFolder(false);
      setNewFolderName('New Folder');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateFolder();
    } else if (e.key === 'Escape') {
      setIsCreatingFolder(false);
      setNewFolderName('New Folder');
    }
  };

  const handleDownloadZip = async (folderId: string) => {
    const folder = folders[folderId];
    if (!folder) return;

    try {
      const response = await fetch(apiUrl('/api/folders/download-zip'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaIds: folder.mediaIds,
          folderName: folder.name,
        }),
      });

      if (!response.ok) {
        throw new Error(`failed to download: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folder.name}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download folder:', error);
      alert('Failed to download folder');
    }
  };

  if (displayFolders.length === 0 && !isCreatingFolder) return null;

  return (
    <div className="mb-12 pt-4">
      <h3
        className={`text-lg font-semibold mb-6 ${
          theme === 'dark' ? 'text-gray-200' : 'text-gray-900'
        }`}
      >
        collections
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
        {/* Inline Create Folder Item - macOS/Windows style */}
        {isCreatingFolder && (
          <div
            className={`flex flex-col items-center cursor-text group relative`}
          >
            {/* Folder Icon Container */}
            <div
              className={`relative w-32 h-32 rounded-lg border-2 flex items-center justify-center transition ${
                theme === 'dark'
                  ? 'border-orange-500 bg-orange-900 bg-opacity-30'
                  : 'border-orange-400 bg-orange-100 bg-opacity-50'
              }`}
            >
              {/* Folder Icon */}
              <div className="text-6xl">📁</div>
            </div>

            {/* Input Field */}
            <input
              ref={inputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleCreateFolder}
              placeholder="Folder name..."
              className={`mt-3 px-3 py-2 rounded-lg border text-center text-sm font-medium transition w-full max-w-xs ${
                theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
        )}

        {/* Existing Folders */}
        {displayFolders.map((folder: VirtualFolder) => (
          <FolderItem
            key={folder.id}
            folder={folder}
            onRename={(newName) => {
              renameFolder(folder.id, newName).catch((error) => {
                console.error('Failed to rename folder:', error);
              });
            }}
            onDelete={() => {
              deleteFolder(folder.id).catch((error) => {
                console.error('Failed to delete folder:', error);
              });
            }}
            onDownloadZip={() => handleDownloadZip(folder.id)}
            onDoubleClick={() => {
              console.log('[FOLDERGRID] Double-click detected on folder:', folder.id, folder.name);
              navigateToFolder(folder.id).catch((error) => {
                console.error('Failed to navigate to folder:', error);
              });
            }}
            onMediaDropped={(mediaIds) => {
              if (onMediaDropped) {
                return onMediaDropped(folder.id, mediaIds);
              }
              const { addMediaToFolder } = useAppStore.getState();
              return addMediaToFolder(folder.id, mediaIds);
            }}
          />
        ))}
      </div>
    </div>
  );
}
