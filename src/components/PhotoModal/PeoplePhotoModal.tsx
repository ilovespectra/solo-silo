import { apiUrl } from '@/lib/api';
'use client';

import { useState, useEffect } from 'react';
import BasePhotoModal, { PhotoModalProps } from './BasePhotoModal';
import FaceSelectionModal from './FaceSelectionModal';
import { FaceCluster, ClusterPhoto } from '../PeoplePane/hooks/useFaceClusters';

interface FaceMapping {
  faceIndex: number;
  clusterId?: string;
  newPersonName?: string;
}

interface PeoplePhotoModalProps extends PhotoModalProps {
  currentClusterId?: string;
  currentClusterName?: string;
  allClusters?: FaceCluster[];
  onMoveCluster?: (mediaId: string, toClusterId: string) => Promise<void>;
  onSetProfilePic?: (mediaId: string) => Promise<void>;
  onAddToMultipleClusters?: (mediaId: string, targetClusters: string[]) => Promise<void>;
  onToggleFavorite?: (mediaId: number) => void;
  isFavorite?: (mediaId: number) => boolean;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
}

export default function PeoplePhotoModal({
  isOpen,
  media,
  currentClusterId,
  currentClusterName,
  allClusters = [],
  onMoveCluster,
  onSetProfilePic,
  onAddToMultipleClusters,
  onClose,
  onConfirm,
  onRemove,
  onToggleFavorite,
  isFavorite,
  onNavigatePrev,
  onNavigateNext,
  canNavigatePrev = false,
  canNavigateNext = false,
  theme = 'dark',
}: PeoplePhotoModalProps) {
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [settingPfp, setSettingPfp] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showFaceSelection, setShowFaceSelection] = useState(false);
  const [isCurrentPhotoConfirmed, setIsCurrentPhotoConfirmed] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentClusterId || !media) return;

    const checkPhotoConfirmation = async () => {
      try {
        const response = await fetch(`/api/faces/${currentClusterId}`);
        if (!response.ok) return;
        
        const photos: ClusterPhoto[] = await response.json();
        const currentPhoto = photos.find((p: ClusterPhoto) => p.id === media.id);
        setIsCurrentPhotoConfirmed(currentPhoto?.is_confirmed || false);
        console.log(`[PeoplePhotoModal] Photo ${media.id} confirmed status:`, currentPhoto?.is_confirmed);
      } catch (error) {
        console.error('[PeoplePhotoModal] Failed to check photo confirmation:', error);
      }
    };

    checkPhotoConfirmation();
  }, [isOpen, currentClusterId, media?.id, media]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && canNavigatePrev && onNavigatePrev) {
        e.preventDefault();
        onNavigatePrev();
      } else if (e.key === 'ArrowRight' && canNavigateNext && onNavigateNext) {
        e.preventDefault();
        onNavigateNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canNavigatePrev, canNavigateNext, onNavigatePrev, onNavigateNext]);
  const otherClusters = allClusters.filter((c) => c.id !== currentClusterId);

  const handleMoveToCluster = async (toClusterId: string) => {
    if (!media || !currentClusterId || !onMoveCluster) return;

    setIsMoving(true);
    try {
      console.log(`[PeoplePhotoModal] moving ${media.id} to cluster ${toClusterId}`);
      await onMoveCluster(media.id, toClusterId);
      console.log(`[PeoplePhotoModal] move successful`);
      setShowMoveDropdown(false);
      setTimeout(onClose, 500);
    } catch (error) {
      console.error('failed to move photo:', error);
      alert(`failed to move photo: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setIsMoving(false);
    }
  };

  const handleSetProfilePic = async () => {
    if (!media || !onSetProfilePic) return;

    setSettingPfp(true);
    try {
      console.log(`[PeoplePhotoModal] setting profile pic: ${media.id}`);
      await onSetProfilePic(media.id);
      console.log(`[PeoplePhotoModal] profile pic set successfully`);
      setShowMoveDropdown(false);
    } catch (error) {
      console.error('failed to set profile picture:', error);
      alert(`failed to set profile picture: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setSettingPfp(false);
    }
  };

  const handleAddSomeone = async (mappings: FaceMapping[]) => {
    if (!media || !onAddToMultipleClusters || !currentClusterId) return;

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
          console.log(`[PeoplePhotoModal] Creating new cluster: ${name}`);
          const response = await fetch(apiUrl('/api/faces/create-cluster'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || `failed to create cluster: ${name}`);
          }
          const data = await response.json();
          console.log(`[PeoplePhotoModal] Created cluster ${data.id}: ${name}`);
          createdClusterIds.push(data.id);
        }
        targetClusters.push(...createdClusterIds);
      } catch (error) {
        console.error('failed to create person clusters:', error);
        throw error;
      }
    }

    try {
      console.log(`[PeoplePhotoModal] Adding photo to clusters:`, targetClusters);
      await onAddToMultipleClusters(media.id, targetClusters);
      setShowFaceSelection(false);
    } catch (error) {
      console.error('failed to add to multiple clusters:', error);
      throw error;
    }
  };

  const handleConfirm = async () => {
    if (!onConfirm || !media) return;
    
    setConfirming(true);
    try {
      console.log('[PeoplePhotoModal] Confirming photo:', media?.id);
      await onConfirm();
      console.log('[PeoplePhotoModal] Photo confirmed successfully');
      setIsCurrentPhotoConfirmed(true);
    } catch (error) {
      console.error('Failed to confirm photo:', error);
      alert(`Failed to confirm photo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <BasePhotoModal
        isOpen={isOpen}
        media={media}
        onClose={onClose}
        onRemove={onRemove}
        theme={theme}
      >
        {/* Navigation Arrows - Transparent Overlays */}
        {isOpen && (
          <>
            {/* Left Arrow */}
            {canNavigatePrev && (
              <button
                onClick={onNavigatePrev}
                className="absolute left-0 top-1/2 -translate-y-1/2 w-16 h-32 hover:bg-white/10 transition flex items-center justify-center text-white text-4xl z-30 cursor-pointer"
                title="Previous photo"
              >
                ‹
              </button>
            )}
            
            {/* Right Arrow */}
            {canNavigateNext && (
              <button
                onClick={onNavigateNext}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-16 h-32 hover:bg-white/10 transition flex items-center justify-center text-white text-4xl z-30 cursor-pointer"
                title="Next photo"
              >
                ›
              </button>
            )}
          </>
        )}

        {/* People-specific actions */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleConfirm}
            disabled={confirming || !onConfirm || isCurrentPhotoConfirmed}
            className={`${
              isCurrentPhotoConfirmed
                ? 'bg-green-600/60 text-green-200'
                : confirming
                ? 'bg-green-600/60 text-green-200'
                : 'bg-green-600/20 hover:bg-green-600/40 text-green-300'
            } disabled:opacity-50 px-4 py-2 rounded transition font-medium w-40`}
            title="Confirm this photo belongs to this person (improves face recognition)"
          >
            {isCurrentPhotoConfirmed ? '✓ confirmed' : confirming ? '⟳ confirming...' : '✓ confirm'}
          </button>

          <button
            onClick={() => {
              if (media && onToggleFavorite) {
                onToggleFavorite(parseInt(media.id));
              }
            }}
            className={`${
              media && isFavorite ? isFavorite(parseInt(media.id)) 
                ? 'bg-yellow-600/40 text-yellow-200' 
                : 'bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-300'
              : 'bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-300'
            } px-4 py-2 rounded transition`}
            title="Add to favorites"
          >
            {media && isFavorite && isFavorite(parseInt(media.id)) ? '★ favorite' : '☆ favorite'}
          </button>

          <button
            onClick={handleSetProfilePic}
            disabled={settingPfp || !onSetProfilePic}
            className="bg-yellow-600/20 hover:bg-yellow-600/40 disabled:opacity-50 text-yellow-300 px-4 py-2 rounded transition"
            title="set as pfp"
          >
            {settingPfp ? 'setting...' : 'set pfp'}
          </button>

          <button
            onClick={() => setShowFaceSelection(true)}
            disabled={!onAddToMultipleClusters}
            className="bg-orange-600/20 hover:bg-orange-600/40 disabled:opacity-50 text-orange-300 px-4 py-2 rounded transition"
            title="Add this photo to other people"
          >
            + add someone
          </button>

          <div className="relative flex-1">
            <button
              onClick={() => setShowMoveDropdown(!showMoveDropdown)}
              disabled={isMoving || otherClusters.length === 0}
              className="bg-purple-600/20 hover:bg-purple-600/40 disabled:opacity-50 text-purple-300 px-4 py-2 rounded transition w-full"
              title="Move to another cluster"
            >
              ↔ move cluster
            </button>

            {/* Dropdown menu */}
            {showMoveDropdown && otherClusters.length > 0 && (
              <div className="absolute bottom-full right-0 mb-2 bg-gray-800 border border-gray-700 rounded shadow-lg z-20 min-w-48 max-h-64 overflow-y-auto">
                <div className="p-1">
                  {otherClusters.map((cluster) => (
                    <button
                      key={cluster.id}
                      onClick={() => handleMoveToCluster(cluster.id)}
                      disabled={isMoving}
                      className="w-full text-left px-3 py-2 hover:bg-gray-700 rounded transition text-sm disabled:opacity-50"
                    >
                      <div className="font-medium text-white">
                        {cluster.name || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-400">
                        {cluster.photo_count} photos
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {otherClusters.length === 0 && (
              <div className="text-xs text-gray-500 mt-1">only 1 cluster available</div>
            )}
          </div>
        </div>
      </BasePhotoModal>

      {/* Face Selection Modal */}
      {media && currentClusterId && currentClusterName && (
        <FaceSelectionModal
          isOpen={showFaceSelection}
          mediaId={media.id}
          imagePath={`/api/media/file/${media.id}`}
          currentClusterId={currentClusterId}
          currentClusterName={currentClusterName}
          allClusters={allClusters}
          onClose={() => setShowFaceSelection(false)}
          onConfirm={handleAddSomeone}
          theme={theme}
        />
      )}
    </>
  );
}
