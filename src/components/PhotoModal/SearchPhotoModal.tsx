'use client';
import { apiUrl } from '@/lib/api';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import BasePhotoModal, { PhotoModalProps } from './BasePhotoModal';
import FaceSelectionModal from './FaceSelectionModal';
import DuplicateClusterDialog from './DuplicateClusterDialog';
import { FaceCluster } from '../PeoplePane/hooks/useFaceClusters';

interface SearchPhotoModalProps extends PhotoModalProps {
  onAssignKeywords?: (mediaId: string, keywords: string[]) => Promise<void>;
  currentKeywords?: string[];
}

interface FaceMapping {
  faceIndex: number;
  clusterId?: string;
  newPersonName?: string;
}

export default function SearchPhotoModal({
  isOpen,
  media,
  onClose,
  onConfirm,
  onRemove,
  onAssignKeywords,
  currentKeywords: initialKeywords = [],
  theme = 'dark',
}: SearchPhotoModalProps) {
  const { isFavorite, addFavorite, removeFavorite } = useAppStore();
  const [keywords, setKeywords] = useState<string[]>(initialKeywords);
  const [keywordInput, setKeywordInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showFaceSelection, setShowFaceSelection] = useState(false);
  const [allClusters, setAllClusters] = useState<FaceCluster[]>([]);
  const [isLoadingClusters, setIsLoadingClusters] = useState(false);
  const [photoInClusters, setPhotoInClusters] = useState<FaceCluster[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{name: string; clusterId: string; photoCount: number} | null>(null);

  useEffect(() => {
    setKeywords(initialKeywords);
  }, [initialKeywords]);

  useEffect(() => {
    if (isOpen && !isLoadingClusters && allClusters.length === 0) {
      const loadClusters = async () => {
        setIsLoadingClusters(true);
        try {
          const response = await fetch(apiUrl('/api/faces/clusters'));
          if (response.ok) {
            const data = await response.json();
            console.log('[SearchPhotoModal] Loaded clusters:', data);
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
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && media?.id && allClusters.length > 0) {
      const loadPhotoClusters = async () => {
        try {
          const numMediaId = parseInt(media.id);
          const response = await fetch(`/api/media/${numMediaId}/clusters`);
          if (response.ok) {
            const clusterIds = await response.json();
            console.log('[SearchPhotoModal] Photo belongs to clusters:', clusterIds);
            const photoClusters = (clusterIds || [])
              .map((id: string) => allClusters.find(c => c.id === id))
              .filter((c: FaceCluster | undefined): c is FaceCluster => c !== undefined);
            setPhotoInClusters(photoClusters);
          }
        } catch (error) {
          console.error('Failed to load photo clusters:', error);
        }
      };
      loadPhotoClusters();
    }
  }, [isOpen, media?.id]);

  const handleAddKeyword = async () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      const newKeywords = [...keywords, keywordInput.trim()];
      setKeywords(newKeywords);
      setKeywordInput('');
      
      if (media && onAssignKeywords) {
        setIsSaving(true);
        try {
          await onAssignKeywords(media.id, newKeywords);
        } catch (error) {
          console.error('Failed to save keyword:', error);
          setKeywords(keywords);
        } finally {
          setIsSaving(false);
        }
      }
    }
  };

  const handleRemoveKeyword = async (keyword: string) => {
    const newKeywords = keywords.filter((k) => k !== keyword);
    setKeywords(newKeywords);
    
    if (media && onAssignKeywords) {
      setIsSaving(true);
      try {
        await onAssignKeywords(media.id, newKeywords);
      } catch (error) {
        console.error('Failed to save keyword removal:', error);
        setKeywords(keywords);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleToggleFavorite = (mediaId: number) => {
    if (isFavorite(mediaId)) {
      removeFavorite(mediaId);
    } else {
      addFavorite(mediaId);
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
          source_cluster_id: 'search',
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
          source_cluster_id: 'search',
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

  return (
    <>
      <BasePhotoModal
        isOpen={isOpen}
        media={media}
        onClose={onClose}
        onConfirm={onConfirm}
        onRemove={onRemove}
        onToggleFavorite={media ? handleToggleFavorite : undefined}
        isFavorite={isFavorite}
        theme={theme}
      >
        {/* People in this photo - shows existing cluster assignments */}
        {photoInClusters.length > 0 && (
          <div className="mb-4">
            <p className={`text-sm font-semibold mb-2 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
            }`}>
              people in this photo:
            </p>
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

        {/* Search-specific actions */}
        <div className="flex-1 flex gap-2 items-center max-w-xs">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Add keyword..."
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddKeyword();
              }}
              disabled={isSaving}
              className="w-full px-3 py-1 rounded text-sm placeholder-gray-500 focus:outline-none disabled:opacity-50 transition"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-primary)',
                border: '1px solid var(--border-primary)'
              }}
            />
          </div>
          <button
            onClick={handleAddKeyword}
            disabled={isSaving}
            className="disabled:opacity-50 px-2 py-1 rounded transition text-sm font-semibold"
            title="Add keyword"
            style={{
              backgroundColor: 'var(--green-glow)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-success)'
            }}
          >
            {isSaving ? '...' : '+'}
          </button>
        </div>

        {/* Keywords display */}
        {keywords.length > 0 && (
          <div className="flex gap-2 flex-wrap max-w-xs">
            {keywords.map((keyword) => (
              <span
                key={keyword}
                className="px-2 py-1 rounded text-sm flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--orange-glow)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)'
                }}
              >
                {keyword}
                <button
                  onClick={() => handleRemoveKeyword(keyword)}
                  disabled={isSaving}
                  className="text-lg leading-none disabled:opacity-50 transition hover:opacity-80"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </BasePhotoModal>

      {/* Face Selection Modal */}
      {media && allClusters.length > 0 && (
        <FaceSelectionModal
          isOpen={showFaceSelection}
          mediaId={media.id}
          imagePath={`/api/media/file/${media.id}`}
          currentClusterId="search"
          currentClusterName="Search Results"
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
    </>
  );
}
