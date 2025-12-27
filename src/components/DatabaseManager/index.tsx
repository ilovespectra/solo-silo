import React, { useRef, useState } from 'react';
import { useSilos } from '@/hooks/useSilos';

export function DatabaseManager() {
  const { activeSilo, downloadDatabase, uploadDatabase, nukeDatabase, loading } = useSilos();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showNukeConfirm, setShowNukeConfirm] = useState(false);

  const handleDownload = async () => {
    try {
      setUploadError('');
      await downloadDatabase(activeSilo?.name);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download database';
      setUploadError(message);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setUploadError('');
      setUploadSuccess(false);

      if (!file.name.endsWith('.zip')) {
        throw new Error('please select a valid silo backup file (.zip)');
      }

      await uploadDatabase(file, activeSilo?.name);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to upload database';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleNuke = async () => {
    try {
      setUploadError('');
      setShowNukeConfirm(false);
      await nukeDatabase(activeSilo?.name);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to nuke database';
      setUploadError(message);
    }
  };

  return (
    <div className="space-y-6 lowercase">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2 lowercase">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v2m0 4v2M9 3h6a9 9 0 019 9v6a9 9 0 01-9 9H9a9 9 0 01-9-9V12a9 9 0 019-9z" />
          </svg>
          database management
        </h3>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Current silo: <span className="font-semibold text-gray-900 dark:text-white">{activeSilo?.name}</span>
          </p>
        </div>

        {uploadSuccess && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            operation completed successfully
          </div>
        )}

        {uploadError && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {uploadError}
          </div>
        )}

        <div className="space-y-3 lowercase">
          {/* Download Database */}
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  download database
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  export your database as an encrypted backup file
                </p>
              </div>
              <button
                onClick={handleDownload}
                disabled={loading || uploading}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-md transition-colors disabled:opacity-50 text-sm font-medium"
              >
                download
              </button>
            </div>
          </div>

          {/* Upload Database */}
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors lowercase">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  upload database
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  merge a backup file into current silo (deduplicates by file hash)
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || uploading}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {uploading ? 'uploading...' : 'upload'}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </div>

          {/* Nuke Database */}
          <div className="p-4 border border-red-200 dark:border-red-900 rounded-lg bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors lowercase">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-red-900 dark:text-red-300 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v2m0 4v2M9 3h6a9 9 0 019 9v6a9 9 0 01-9 9H9a9 9 0 01-9-9V12a9 9 0 019-9z" />
                  </svg>
                  nuke database
                </h4>
                <p className="text-sm text-red-800 dark:text-red-400 mt-1">
                  permanently erase all data in this silo (cannot be undone!)
                </p>
              </div>
              <button
                onClick={() => setShowNukeConfirm(true)}
                disabled={loading || uploading}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors disabled:opacity-50 text-sm font-medium"
              >
                nuke
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Nuke Confirmation Dialog */}
      {showNukeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm lowercase">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-96 shadow-xl border border-red-200 dark:border-red-900">
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-300 mb-2">
              ⚠️ nuke database?
            </h3>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              this will permanently erase all photos, people, and data in the &quot;{activeSilo?.name}&quot; silo.
            </p>
            <p className="text-red-700 dark:text-red-400 font-semibold mb-4">
              this action cannot be undone!
            </p>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNukeConfirm(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                cancel
              </button>
              <button
                onClick={handleNuke}
                disabled={uploading}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50"
              >
                {uploading ? 'nuking...' : 'yes, nuke it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
