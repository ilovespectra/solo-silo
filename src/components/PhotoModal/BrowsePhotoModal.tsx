'use client';
import { apiUrl } from '@/lib/api';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import BasePhotoModal, { PhotoModalProps } from './BasePhotoModal';
import FaceSelectionModal from './FaceSelectionModal';
import DuplicateClusterDialog from './DuplicateClusterDialog';
import { FaceCluster } from '../PeoplePane/hooks/useFaceClusters';

interface BrowsePhotoModalProps extends PhotoModalProps {
  onRotate?: (mediaId: string, rotation: number) => void;
}

interface FaceMapping {
  faceIndex: number;
  clusterId?: string;
  newPersonName?: string;
}

export default function BrowsePhotoModal({
  isOpen,
  media,
  onClose,
  onConfirm,
  onRemove,
  onRotate,
  theme = 'dark',
}: BrowsePhotoModalProps) {
  const { isFavorite, addFavorite, removeFavorite } = useAppStore();
  const [showFaceSelection, setShowFaceSelection] = useState(false);
  const [allClusters, setAllClusters] = useState<FaceCluster[]>([]);
  const [isLoadingClusters, setIsLoadingClusters] = useState(false);
  const [photoInClusters, setPhotoInClusters] = useState<FaceCluster[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{name: string; clusterId: string; photoCount: number} | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [selectedClustersForMerge, setSelectedClustersForMerge] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && !isLoadingClusters && allClusters.length === 0) {
      const loadClusters = async () => {
        setIsLoadingClusters(true);
        try {
          const response = await fetch(apiUrl('/api/faces/clusters'));
          if (response.ok) {
            const data = await response.json();
            console.log('[BrowsePhotoModal] Loaded clusters:', data);
            data?.forEach((c: FaceCluster) => console.log(`  - ${c.id}: "${c.name || 'unnamed'}"`));
            setAllClusters(data || []);
          }
        } catch (error) {
          console.error('Failed to load clusters:', error);
        } finally {
          setIsLoadingClusters(false);
        }
      };
      loadClusters();
    }
  }, [isOpen, isLoadingClusters, allClusters.length]);

  useEffect(() => {
    if (isOpen && media?.id && allClusters.length > 0) {
      const loadPhotoClusters = async () => {
        try {
          const numMediaId = parseInt(media.id);
          const response = await fetch(`/api/media/${numMediaId}/clusters`);
          if (response.ok) {
            const clusterIds = await response.json();
            console.log('[BrowsePhotoModal] Photo belongs to clusters:', clusterIds);
            const photoClusters = (clusterIds || [])
              .map((id: string) => allClusters.find((c: FaceCluster) => c.id === id))
              .filter((c: FaceCluster | undefined): c is FaceCluster => c !== undefined);
            setPhotoInClusters(photoClusters);
          }
        } catch (error) {
          console.error('Failed to load photo clusters:', error);
        }
      };
      loadPhotoClusters();
    }
  }, [isOpen, media?.id, allClusters]);

  const handleToggleFavorite = async (mediaId: number) => {
    try {
      if (isFavorite(mediaId)) {
        removeFavorite(mediaId);
      } else {
        addFavorite(mediaId);
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleAddSomeone = async (mappings: FaceMapping[]) => {
    if (!media) return;

    const targetClusters: string[] = [];
    const newPersonNames: string[] = [];

    mappings.forEach((mapping) => {
      if (mapping.clusterId) {
        targetClusters.push(mapping.clusterId);
      } else if (mapping.newPersonName) {
        newPersonNames.push(mapping.newPersonName);
      }
    });

    if (newPersonNames.length > 0) {
      try {
        const createdClusterIds: string[] = [];
        for (const name of newPersonNames) {
          const checkResponse = await fetch(apiUrl('/api/faces/check-duplicate-name'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() }),
          });

          if (!checkResponse.ok) throw new Error('Failed to check cluster name');
          const checkData = await checkResponse.json();

          if (checkData.exists) {
            setDuplicateInfo({
              name: checkData.cluster_name,
              clusterId: checkData.cluster_id,
              photoCount: checkData.photo_count,
            });
            setShowDuplicateDialog(true);
            return;
          }

          const response = await fetch(apiUrl('/api/faces/create-cluster'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          if (!response.ok) throw new Error(`failed to create cluster: ${name}`);
          const data = await response.json();
          createdClusterIds.push(data.id);
        }
        targetClusters.push(...createdClusterIds);
      } catch (error) {
        console.error('failed to create person clusters:', error);
        throw error;
      }
    }

    try {
      const response = await fetch(apiUrl('/api/faces/add-to-multiple-clusters'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_id: parseInt(media.id),
          source_cluster_id: 'browse',
          target_clusters: targetClusters,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to add photo to clusters');
      }

      setShowFaceSelection(false);
      setAllClusters([]);
    } catch (error) {
      console.error('failed to add to multiple clusters:', error);
      throw error;
    }
  };

  const handleMergeClusters = async (targetClusterId: string) => {
    if (!media) return;

    try {
      const response = await fetch(apiUrl('/api/faces/add-to-multiple-clusters'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_id: parseInt(media.id),
          source_cluster_id: 'browse',
          target_clusters: [targetClusterId],
        }),
      });

      if (!response.ok) throw new Error('Failed to add photo to cluster');

      setShowDuplicateDialog(false);
      setDuplicateInfo(null);
      setShowFaceSelection(false);
      setAllClusters([]);
    } catch (err) {
      console.error('Failed to merge:', err);
      alert(`Failed to merge: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleMergePhotoToClusters = async () => {
    if (!media || selectedClustersForMerge.size === 0) return;

    try {
      const response = await fetch(apiUrl('/api/faces/add-to-multiple-clusters'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_id: parseInt(media.id),
          source_cluster_id: 'browse',
          target_clusters: Array.from(selectedClustersForMerge),
        }),
      });

      if (!response.ok) throw new Error('Failed to update cluster assignments');

      setShowMergeDialog(false);
      setSelectedClustersForMerge(new Set());
      setPhotoInClusters([]);
      setAllClusters([]);
    } catch (err) {
      console.error('Failed to merge clusters:', err);
      alert(`Failed to update clusters: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <>
      <BasePhotoModal
        isOpen={isOpen}
        media={media}
        onClose={onClose}
        onConfirm={onConfirm}
        onRemove={onRemove}
        onRotate={onRotate}
        onToggleFavorite={media ? handleToggleFavorite : undefined}
        isFavorite={isFavorite}
        theme={theme}
      >
        {/* People in this photo - shows existing cluster assignments */}
        {photoInClusters.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className={`text-sm font-semibold ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}>
                👥 People in this photo:
              </p>
              {photoInClusters.length > 0 && (
                <button
                  onClick={() => {
                    setSelectedClustersForMerge(new Set(photoInClusters.map(c => c.id)));
                    setShowMergeDialog(true);
                  }}
                  className="px-2 py-1 rounded text-xs font-medium transition bg-orange-600 hover:bg-orange-700 text-white"
                  title="Merge this photo into different clusters"
                >
                  ⟳ merge
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {photoInClusters.map((cluster) => (
                <span
                  key={cluster.id}
                  className="px-3 py-1 rounded text-sm font-medium"
                  style={{
                    backgroundColor: 'var(--orange-glow)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-primary)'
                  }}
                >
                  {cluster.name || 'Unknown'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Face selection button */}
        {media && (
          <button
            onClick={() => setShowFaceSelection(true)}
            disabled={allClusters.length === 0 || isLoadingClusters}
            className="px-3 py-1 rounded text-sm font-medium transition disabled:opacity-50"
            style={{
              backgroundColor: 'var(--orange-glow)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
            title={isLoadingClusters ? 'Loading people...' : allClusters.length === 0 ? 'No people clusters available' : 'Add detected faces to people'}
          >
            {isLoadingClusters ? '⟳ loading...' : '+ add face to people'}
          </button>
        )}
      </BasePhotoModal>

      {/* Face Selection Modal */}
      {media && allClusters.length > 0 && (
        <FaceSelectionModal
          isOpen={showFaceSelection}
          mediaId={media.id}
          imagePath={`/api/media/file/${media.id}`}
          currentClusterId="browse"
          currentClusterName="Browse"
          allClusters={allClusters}
          onClose={() => setShowFaceSelection(false)}
          onConfirm={handleAddSomeone}
          theme={theme}
        />
      )}

      {/* Duplicate Cluster Dialog */}
      {duplicateInfo && (
        <DuplicateClusterDialog
          isOpen={showDuplicateDialog}
          duplicateName={duplicateInfo.name}
          duplicateClusterId={duplicateInfo.clusterId}
          clusterCount={duplicateInfo.photoCount}
          allClusters={allClusters}
          theme={theme}
          onMerge={handleMergeClusters}
          onCancel={() => {
            setShowDuplicateDialog(false);
            setDuplicateInfo(null);
          }}
        />
      )}

      {/* merge clusters Dialog */}
      {showMergeDialog && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-50"
            onClick={() => setShowMergeDialog(false)}
          />
          <div
            className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 rounded-lg shadow-2xl w-full max-w-md mx-4 ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-white'
            }`}
          >
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
                merge clusters
              </h2>
            </div>

            <div
              className={`px-6 py-4 max-h-96 overflow-y-auto ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}
            >
              <p className="mb-4 text-sm">
                select which clusters this photo should belong to:
              </p>

              <div className={`space-y-2 border rounded ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                {allClusters.length === 0 ? (
                  <p className={`px-4 py-3 text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                    No clusters available
                  </p>
                ) : (
                  allClusters.map((cluster) => (
                    <label
                      key={cluster.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${
                        selectedClustersForMerge.has(cluster.id)
                          ? theme === 'dark'
                            ? 'bg-orange-900 bg-opacity-50'
                            : 'bg-orange-100'
                          : theme === 'dark'
                          ? 'hover:bg-gray-800'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedClustersForMerge.has(cluster.id)}
                        onChange={(e) => {
                          const newSelection = new Set(selectedClustersForMerge);
                          if (e.target.checked) {
                            newSelection.add(cluster.id);
                          } else {
                            newSelection.delete(cluster.id);
                          }
                          setSelectedClustersForMerge(newSelection);
                        }}
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
                  ))
                )}
              </div>
            </div>

            <div
              className={`px-6 py-4 border-t flex gap-3 ${
                theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
              }`}
            >
              <button
                onClick={() => setShowMergeDialog(false)}
                className={`flex-1 px-4 py-2 rounded font-medium transition ${
                  theme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleMergePhotoToClusters}
                disabled={selectedClustersForMerge.size === 0}
                className={`flex-1 px-4 py-2 rounded font-medium transition disabled:opacity-50 ${
                  theme === 'dark'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                ✓ save
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
