'use client';

import { useState } from 'react';
import { FaceCluster } from '../PeoplePane/hooks/useFaceClusters';

interface DuplicateClusterDialogProps {
  isOpen: boolean;
  duplicateName: string;
  duplicateClusterId: string;
  clusterCount: number;
  allClusters: FaceCluster[];
  theme?: 'dark' | 'light';
  onMerge: (targetClusterId: string) => Promise<void>;
  onCancel: () => void;
}

export default function DuplicateClusterDialog({
  isOpen,
  duplicateName,
  duplicateClusterId,
  clusterCount,
  allClusters,
  theme = 'dark',
  onMerge,
  onCancel,
}: DuplicateClusterDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState<string>(duplicateClusterId);

  if (!isOpen) return null;

  const duplicateCluster = allClusters.find(c => c.id === duplicateClusterId);
  const otherClusters = allClusters.filter(c => c.id !== duplicateClusterId);

  const handleMerge = async () => {
    if (!selectedClusterId) return;
    setIsLoading(true);
    try {
      await onMerge(selectedClusterId);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 rounded-lg shadow-2xl w-full max-w-md mx-4 ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 border-b ${
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <h2
            className={`text-lg font-bold ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}
          >
            ⚠️ merge into cluster
          </h2>
        </div>

        {/* Content */}
        <div
          className={`px-6 py-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}
        >
          <p className="mb-4 text-sm">
            a cluster named <strong>&quot;{duplicateName}&quot;</strong> already exists with {clusterCount} photo{clusterCount !== 1 ? 's' : ''}.
          </p>

          <p className="mb-4 text-sm">
            select a cluster to merge into:
          </p>

          <div className="mb-6 max-h-48 overflow-y-auto border rounded">
            <div
              className={`${
                theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'
              }`}
            >
              {allClusters.length === 0 ? (
                <p className={`px-4 py-3 text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                  No clusters available
                </p>
              ) : (
                <>
                  {/* Show existing/duplicate cluster first */}
                  {duplicateCluster && (
                    <label
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition border-b ${
                        selectedClusterId === duplicateClusterId
                          ? theme === 'dark'
                            ? 'bg-green-900 bg-opacity-50'
                            : 'bg-green-100'
                          : theme === 'dark'
                          ? 'hover:bg-gray-800'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="cluster"
                        value={duplicateClusterId}
                        checked={selectedClusterId === duplicateClusterId}
                        onChange={(e) => setSelectedClusterId(e.target.value)}
                        className="cursor-pointer"
                      />
                      <div>
                        <p className={`text-sm font-bold ${theme === 'dark' ? 'text-green-300' : 'text-green-700'}`}>
                          ✓ {duplicateCluster.name || 'Unnamed'} (existing)
                        </p>
                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          {clusterCount} photo{clusterCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </label>
                  )}

                  {/* Show other clusters */}
                  {otherClusters.length > 0 && (
                    <>
                      {duplicateCluster && (
                        <p className={`px-4 py-2 text-xs font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          or merge into another cluster:
                        </p>
                      )}
                      {otherClusters.map((cluster) => (
                        <label
                          key={cluster.id}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${
                            selectedClusterId === cluster.id
                              ? theme === 'dark'
                                ? 'bg-orange-900 bg-opacity-50'
                                : 'bg-orange-100'
                              : theme === 'dark'
                              ? 'hover:bg-gray-800'
                              : 'hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="radio"
                            name="cluster"
                            value={cluster.id}
                            checked={selectedClusterId === cluster.id}
                            onChange={(e) => setSelectedClusterId(e.target.value)}
                            className="cursor-pointer"
                          />
                          <div>
                            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                              {cluster.name || 'Unnamed'}
                            </p>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                              {cluster.photo_count || 0} photo{cluster.photo_count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </label>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div
          className={`px-6 py-4 border-t flex gap-3 ${
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <button
            onClick={onCancel}
            disabled={isLoading}
            className={`flex-1 px-4 py-2 rounded font-medium transition disabled:opacity-50 ${
              theme === 'dark'
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            cancel
          </button>

          <button
            onClick={handleMerge}
            disabled={isLoading || !selectedClusterId}
            className={`flex-1 px-4 py-2 rounded font-medium transition disabled:opacity-50 ${
              theme === 'dark'
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'bg-orange-500 hover:bg-orange-600 text-white'
            }`}
          >
            {isLoading ? '⟳ merging...' : '✓ merge'}
          </button>
        </div>
      </div>
    </>
  );
}
