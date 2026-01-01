import { apiUrl } from '@/lib/api';
'use client';

import React, { useState, useEffect } from 'react';

interface FolderPickerProps {
  onPathSelected: (path: string) => void;
  onCancel: () => void;
  theme?: 'light' | 'dark';
}

interface CommonPath {
  label: string;
  path: string;
}

export default function FolderPicker({ onPathSelected, onCancel, theme = 'light' }: FolderPickerProps) {
  const [commonPaths, setCommonPaths] = useState<CommonPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  useEffect(() => {
    loadCommonPaths();
  }, []);

  const loadCommonPaths = async () => {
    try {
      const response = await fetch(apiUrl('/api/system/paths'));
      const data = await response.json();

      if (!data.commonPaths || typeof data.commonPaths !== 'object') {
        console.warn('Backend returned invalid commonPaths structure:', data);
        setCommonPaths([]);
      } else {
        const paths: CommonPath[] = Object.entries(data.commonPaths).map(
          ([label, pathValue]) => ({
            label,
            path: pathValue as string,
          })
        );
        setCommonPaths(paths);
      }
    } catch (err) {
      console.error('Failed to load common paths:', err);
      setCommonPaths([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNativeFolderPicker = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        setError('Your browser does not support directory selection');
        return;
      }

      setResolving(true);
      setError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'read',
      });

      const folderName = (dirHandle as { name: string }).name;
      console.log('[FolderPicker] Selected folder name:', folderName);
      
      const fileNames: string[] = [];
      let count = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const entry of (dirHandle as any).entries()) {
        fileNames.push(entry[0]);
        if (++count >= 10) break;
      }
      console.log('[FolderPicker] Sample files:', fileNames);

      console.log('[FolderPicker] Sending to /api/system/resolve-directory');
      const res = await fetch(apiUrl('/api/system/resolve-directory'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          folderName,
          sampleFiles: fileNames 
        }),
      });

      const responseData = await res.json();
      console.log('[FolderPicker] Resolve response:', res.status, responseData);

      if (res.ok) {
        if (responseData.path) {
          console.log('[FolderPicker] Got resolved path:', responseData.path);
          setResolving(false);
          onPathSelected(responseData.path);
          return;
        }
      } else {
        setError(`Failed to resolve directory: ${responseData.detail || 'Unknown error'}`);
      }
    } catch (err: unknown) {
      const error = err as Record<string, unknown>;
      if ((error as { name: string }).name !== 'AbortError') {
        const msg = (error as { message: string }).message || String(err);
        console.error('[FolderPicker] Error:', msg);
        setError(`Error selecting directory: ${msg}`);
      }
    } finally {
      setResolving(false);
    }
  };

  const handleCommonPathSelect = (path: string) => {
    setError(null);
    onPathSelected(path);
  };

  const handleManualPathSubmit = () => {
    if (!manualPath.trim()) {
      setError('Please enter a path');
      return;
    }
    if (!manualPath.startsWith('/') && !manualPath.startsWith('~')) {
      setError('Path must be absolute (start with /) or relative to home (start with ~)');
      return;
    }
    setError(null);
    onPathSelected(manualPath);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>
          select a folder
        </h3>
        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
          choose folders you want to search through.
        </p>
      </div>

      {error && (
        <div className={`p-3 rounded-lg text-sm border ${
          theme === 'dark'
            ? 'bg-red-900 bg-opacity-30 border-red-700 text-red-200'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {error}
        </div>
      )}

      {/* Native Folder Picker Button */}
      <button
        type="button"
        onClick={handleNativeFolderPicker}
        disabled={resolving}
        className={`w-full px-4 py-4 border-2 border-dashed rounded-lg transition flex items-center justify-center gap-2 font-medium text-lg ${
          resolving
            ? theme === 'dark'
              ? 'border-gray-600 bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed'
            : theme === 'dark'
            ? 'border-orange-600 hover:border-orange-500 hover:bg-orange-900 hover:bg-opacity-30'
            : 'border-orange-400 hover:border-orange-600 hover:bg-orange-50'
        }`}
      >
        <span>{resolving ? '⟳' : '📁'}</span>
        <span className={theme === 'dark' ? 'text-orange-400' : 'text-orange-600'}>
          {resolving ? 'resolving folder...' : 'browse...'}
        </span>
      </button>

      {/* Toggle Manual Input */}
      <button
        type="button"
        onClick={() => {
          setShowManualInput(!showManualInput);
          setError(null);
        }}
        className={`w-full px-3 py-2 text-sm rounded-lg border transition ${
          theme === 'dark'
            ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
        }`}
      >
        {showManualInput ? 'hide manual input' : 'or enter path manually'}
      </button>

      {/* Manual Path Input */}
      {showManualInput && (
        <div className="space-y-2 p-3 rounded-lg border border-dashed" 
             style={{borderColor: theme === 'dark' ? '#555' : '#ddd'}}>
          <label className={`block text-xs font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            full path to folder
          </label>
          <input
            type="text"
            value={manualPath}
            onChange={(e) => {
              setManualPath(e.target.value);
              setError(null);
            }}
            placeholder="/path/to/folder or ~/folder"
            className={`w-full px-3 py-2 rounded border text-sm ${
              theme === 'dark'
                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
            }`}
          />
          <button
            type="button"
            onClick={handleManualPathSubmit}
            className={`w-full px-3 py-2 rounded text-sm font-medium transition ${
              theme === 'dark'
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-orange-500 text-white hover:bg-orange-600'
            }`}
          >
            confirm path
          </button>
        </div>
      )}

      {/* Quick Access as secondary option */}
      {!loading && commonPaths.length > 0 && (
        <div>
          <label className={`block text-xs font-semibold ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'} mb-2`}>
            or quick access
          </label>
          <div className="grid grid-cols-2 gap-2">
            {commonPaths.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => handleCommonPathSelect(item.path)}
                className={`p-3 text-left text-sm rounded-lg border transition ${
                  theme === 'dark'
                    ? 'border-gray-600 hover:border-orange-500 hover:bg-orange-900 hover:bg-opacity-20'
                    : 'border-gray-200 hover:border-orange-400 hover:bg-orange-50'
                }`}
              >
                <div className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {item.label}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cancel Button */}
      <button
        type="button"
        onClick={onCancel}
        className={`w-full px-4 py-2 rounded-lg transition border ${
          theme === 'dark'
            ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
        }`}
      >
        cancel
      </button>
    </div>
  );
}
