'use client';

import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSuccess?: () => void;
  parentFolderId?: string;
}

export default function CreateFolderModal({
  isOpen,
  onClose,
  onCreateSuccess,
  parentFolderId,
}: CreateFolderModalProps) {
  const { theme, createFolder, folders } = useAppStore();
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log('[CreateFolderModal] modal opened with parentFolderId:', parentFolderId);
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, parentFolderId]);

  const handleCreate = async () => {
    const trimmedName = folderName.trim();
    
    if (!trimmedName) {
      setError('folder name cannot be empty');
      return;
    }

    if (trimmedName.length > 100) {
      setError('folder name must be less than 100 characters');
      return;
    }

    setIsCreating(true);
    try {
      console.log('[CreateFolderModal] creating folder:', { trimmedName, parentFolderId });
      await createFolder(trimmedName, parentFolderId);
      console.log('[CreateFolderModal] folder created successfully');
      setFolderName('');
      setError('');
      onCreateSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to create folder');
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreate();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className={`rounded-lg p-8 max-w-md w-full mx-4 ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className={`text-2xl font-bold mb-4 ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}
        >
          {parentFolderId ? `Create Subfolder in "${folders[parentFolderId]?.name || 'folder'}"` : 'Create New Folder'}
        </h2>

        <input
          ref={inputRef}
          type="text"
          value={folderName}
          onChange={(e) => {
            setFolderName(e.target.value);
            setError('');
          }}
          onKeyDown={handleKeyDown}
          placeholder="Enter folder name"
          className={`w-full px-4 py-2 rounded-lg border mb-4 transition ${
            theme === 'dark'
              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
              : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'
          } ${error ? (theme === 'dark' ? 'border-red-600' : 'border-red-400') : ''}`}
        />

        {error && (
          <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
            {error}
          </p>
        )}

        <div className="flex gap-4 justify-end">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              theme === 'dark'
                ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
            }`}
          >
            cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className={`px-4 py-2 rounded-lg font-medium text-white transition ${
              theme === 'dark'
                ? 'bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400'
                : 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-400'
            }`}
          >
            {isCreating ? 'creating...' : 'create'}
          </button>
        </div>
      </div>
    </div>
  );
}
