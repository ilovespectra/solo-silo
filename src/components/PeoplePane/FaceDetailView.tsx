'use client';
import { apiUrl } from '@/lib/api';

import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import PeoplePhotoModal from '@/components/PhotoModal/PeoplePhotoModal';
import { FaceCluster, ClusterPhoto, useFaceClusters } from './hooks/useFaceClusters';

interface FaceDetailViewProps {
  cluster: FaceCluster;
  onClose: () => void;
  theme: 'light' | 'dark';
  onUpdated: () => void;
}

type TabType = 'photos' | 'add' | 'settings';

export default function FaceDetailView({ cluster, onClose, theme, onUpdated }: FaceDetailViewProps) {
  const { isFavorite, addFavorite, removeFavorite, activeSiloName } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabType>('photos');
  const [name, setName] = useState(cluster.name || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<ClusterPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<ClusterPhoto | null>(null);
  const [allClusters, setAllClusters] = useState<FaceCluster[]>([]);
  const [photoRotations, setPhotoRotations] = useState<Record<string, number>>({});
  const [thumbnailRotation, setThumbnailRotation] = useState(0);
  const [hoveredPhotoId, setHoveredPhotoId] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [selectedTargetCluster, setSelectedTargetCluster] = useState<string>('');
  const [isMerging, setIsMerging] = useState(false);
  const { renameCluster, hideCluster, removePhotoFromCluster, getClusterPhotos, addPhotoToCluster, fetchClusters } = useFaceClusters();
  const modalRef = useRef<HTMLDivElement>(null);

  const handleRotatePhoto = async (photoId: string, direction: 'cw' | 'ccw') => {
    setPhotoRotations(prev => {
      const current = prev[photoId] || 0;
      let next = current + (direction === 'cw' ? 90 : -90);
      if (next < 0) next = 270;
      if (next >= 360) next = 0;
      
      fetch(`/api/media/${photoId}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotation: next }),
      }).catch(err => console.error(`Failed to save rotation for photo ${photoId}:`, err));
      
      return { ...prev, [photoId]: next };
    });
  };

  const reloadPhotos = async () => {
    try {
      setPhotosLoading(true);
      const data = await getClusterPhotos(cluster.id);
      
      const uniquePhotos = Array.from(new Map(data.map(photo => [photo.id, photo])).values());
      setPhotos(uniquePhotos);
      
      const rotations: Record<string, number> = {};
      for (const photo of uniquePhotos) {
        try {
          const res = await fetch(`/api/media/${photo.id}/metadata`);
          if (res.ok) {
            const metadata = await res.json();
            rotations[photo.id] = metadata.rotation || 0;
          }
        } catch (err) {
          console.error(`Failed to load rotation for photo ${photo.id}:`, err);
        }
      }
      setPhotoRotations(rotations);
    } catch (err) {
      console.error('Failed to reload photos:', err);
      setPhotos([]);
    } finally {
      setPhotosLoading(false);
    }
  };

  const loadAllClusters = async () => {
    try {
      const clusters = await fetchClusters(false);
      setAllClusters(clusters);
    } catch (err) {
      console.error('Failed to load clusters:', err);
    }
  };

  useEffect(() => {
    reloadPhotos();
    loadAllClusters();
    
    const extractMediaId = () => {
      const url = cluster.primary_thumbnail;
      if (!url) return null;
      const match = url.match(/thumbnail\/(\d+)/);
      return match ? parseInt(match[1]) : null;
    };
    
    const mediaId = extractMediaId();
    if (mediaId) {
      fetch(`/api/media/${mediaId}/metadata`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.rotation) {
            setThumbnailRotation(data.rotation);
          }
        })
        .catch(err => console.error('Failed to load thumbnail rotation:', err));
    }
  }, [cluster.id, cluster.primary_thumbnail, getClusterPhotos, fetchClusters]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveName = async () => {
    if (name.trim() === cluster.name) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      await renameCluster(cluster.id, name.trim());
      setIsEditing(false);
      onUpdated();
    } catch (err) {
      console.error('Failed to save name:', err);
      setName(cluster.name || '');
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePhoto = async (photoId: string) => {
    try {
      console.log(`Removing photo ${photoId} from cluster ${cluster.id}`);
      await removePhotoFromCluster(cluster.id, photoId);
      console.log(`Successfully removed photo ${photoId}`);
      const newPhotos = photos.filter(p => p.id !== photoId);
      setPhotos(newPhotos);
      setPhotoRotations(prev => {
        const updated = { ...prev };
        delete updated[photoId];
        return updated;
      });
      
      if (newPhotos.length === 0) {
        console.log('Last photo removed, closing cluster detail view');
        onClose();
      }
      
      onUpdated();
    } catch (err) {
      console.error('Failed to remove photo:', err);
    }
  };

  const handleSetProfilePic = async (photoId: string) => {
    try {
      const response = await fetch(`/api/faces/${cluster.id}/profile-pic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: photoId }),
      });

      if (!response.ok) throw new Error('failed to set profile picture');
      onUpdated();
      console.log(`profile picture updated for cluster ${cluster.id}`);
    } catch (err) {
      console.error('failed to set profile picture:', err);
    }
  };

  const handleConfirmPhoto = async (photoId: string) => {
    try {
      console.log(`confirming photo ${photoId} in cluster ${cluster.id}`);
      const response = await fetch(`/api/faces/${cluster.id}/confirm?media_id=${photoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to confirm photo');
      }
      
      console.log(`Photo confirmed successfully`);
      await reloadPhotos();
      onUpdated();
    } catch (err) {
      console.error('failed to confirm photo:', err);
      alert(`failed to confirm photo: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleMoveCluster = async (mediaId: string, toClusterId: string) => {
    try {
      console.log(`moving photo ${mediaId} from cluster ${cluster.id} to ${toClusterId}`);
      const response = await fetch(`/api/faces/${cluster.id}/move-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          media_id: mediaId,
          from_cluster_id: cluster.id,
          to_cluster_id: toClusterId 
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'failed to move photo');
      }
      
      console.log(`photo moved successfully: ${data.message}`);
      await reloadPhotos();
      onUpdated();
      setSelectedPhoto(null);
    } catch (err) {
      console.error('failed to move photo:', err);
      alert(`failed to move photo: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAddToMultipleClusters = async (mediaId: string, targetClusters: string[]) => {
    try {
      console.log(`adding photo ${mediaId} to multiple clusters:`, targetClusters);
      const response = await fetch(apiUrl('/api/faces/add-to-multiple-clusters'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_id: mediaId,
          source_cluster_id: cluster.id,
          target_clusters: targetClusters,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'failed to add photo to clusters');
      }
      
      console.log(`photo added to clusters successfully: ${data.message}`);
      
      const unknownClusters = targetClusters.filter(clusterId => {
        const targetCluster = allClusters.find((c: FaceCluster) => c.id === clusterId);
        return targetCluster && (targetCluster.name === 'unknown' || targetCluster.name === 'Unknown');
      });
      
      if (unknownClusters.length > 0) {
        const unknownClusterId = unknownClusters[0];
        const unknownCluster = allClusters.find(c => c.id === unknownClusterId);
        
        if (unknownCluster) {
          try {
            console.log(`[FaceDetailView] Moving photo ${mediaId} to unknown cluster: ${unknownClusterId}`);
            const moveResponse = await fetch(apiUrl('/api/faces/move-photo'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                media_id: parseInt(mediaId),
                from_cluster_id: cluster.id,
                to_cluster_id: unknownClusterId,
              }),
            });
            
            if (moveResponse.ok) {
              console.log(`[FaceDetailView] Photo moved to unknown cluster successfully`);
            }
          } catch (moveErr) {
            console.error(`[FaceDetailView] Failed to move photo to unknown cluster:`, moveErr);
          }
        }
      }
      
      await reloadPhotos();
      onUpdated();
      setSelectedPhoto(null);
    } catch (err) {
      console.error('Failed to add photo to multiple clusters:', err);
      throw err;
    }
  };

  const handleMergeCluster = async () => {
    if (!selectedTargetCluster) return;

    setIsMerging(true);
    try {
      console.log(`[FaceDetailView] Merging cluster ${cluster.id} into ${selectedTargetCluster}`);
      console.log(`[FaceDetailView] Moving ${photos.length} photos...`);
      
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        console.log(`[FaceDetailView] Moving photo ${i + 1}/${photos.length}: ${photo.id}`);
        
        const response = await fetch(`/api/faces/${cluster.id}/move-photo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            media_id: photo.id,
            from_cluster_id: cluster.id,
            to_cluster_id: selectedTargetCluster 
          }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.detail || data.message || `failed to move photo ${photo.id}`);
        }
        
        console.log(`[FaceDetailView] photo ${photo.id} moved successfully`);
      }
      console.log('[FaceDetailView] merge successful - all photos moved');
      
      setShowMergeDialog(false);
      setSelectedTargetCluster('');
      
      // Call onUpdated to refresh parent cluster list with updated counts
      await onUpdated();
      
      // Then close after parent has refreshed
      onClose();
    } catch (err) {
      console.error('failed to merge clusters:', err);
      alert(`failed to merge clusters: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setIsMerging(false);
    }
  };

  const handleClickOutside = (e: React.MouseEvent) => {
    if (modalRef.current === e.target) {
      onClose();
    }
  };

  const handleNavigatePrev = () => {
    if (!selectedPhoto) return;
    const currentIndex = photos.findIndex(p => p.id === selectedPhoto.id);
    if (currentIndex > 0) {
      setSelectedPhoto(photos[currentIndex - 1]);
    }
  };

  const handleNavigateNext = () => {
    if (!selectedPhoto) return;
    const currentIndex = photos.findIndex(p => p.id === selectedPhoto.id);
    if (currentIndex < photos.length - 1) {
      setSelectedPhoto(photos[currentIndex + 1]);
    }
  };

  const canNavigatePrev = selectedPhoto ? photos.findIndex(p => p.id === selectedPhoto.id) > 0 : false;
  const canNavigateNext = selectedPhoto ? photos.findIndex(p => p.id === selectedPhoto.id) < photos.length - 1 : false;

  return (
    <div
      ref={modalRef}
      onClick={handleClickOutside}
      className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        className={`${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        } rounded-lg max-w-3xl w-full my-8 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`border-b ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        } p-6 flex items-start justify-between`}>
          <div className="flex items-start gap-6 flex-1">
            {/* Large Thumbnail */}
            <div className={`w-24 h-24 rounded-full overflow-hidden flex-shrink-0 ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
            }`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cluster.primary_thumbnail}
                alt={cluster.name || 'Unknown'}
                className={`w-full h-full object-cover ${
                  thumbnailRotation === 90 ? 'rotate-90' :
                  thumbnailRotation === 180 ? 'rotate-180' :
                  thumbnailRotation === 270 ? '-rotate-90' : ''
                }`}
                style={{ transformOrigin: 'center' }}
              />
            </div>

            {/* Name */}
            <div className="flex-1 pt-2">
              {isEditing ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="enter name"
                    autoFocus
                    className={`flex-1 px-3 py-2 rounded-lg border ${
                      theme === 'dark'
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-gray-50 border-gray-300 text-gray-900'
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') {
                        setName(cluster.name || '');
                        setIsEditing(false);
                      }
                    }}
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isSaving}
                    className={`px-4 py-2 rounded-lg font-medium transition ${
                      theme === 'dark'
                        ? 'bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50'
                        : 'bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50'
                    }`}
                  >
                    {isSaving ? 'saving...' : 'save'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <h2 className={`text-2xl font-bold ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    {cluster.name || 'unnamed'}
                  </h2>
                  <button
                    onClick={() => setIsEditing(true)}
                    className={`px-3 py-1 rounded text-sm font-medium transition ${
                      theme === 'dark'
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    ✎ edit
                  </button>
                  <button
                    onClick={() => setShowMergeDialog(true)}
                    className={`px-3 py-1 rounded text-sm font-medium transition ${
                      theme === 'dark'
                        ? 'bg-orange-600 hover:bg-orange-700 text-white'
                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                    }`}
                    title="merge cluster with another"
                  >
                    ⟳ merge cluster
                  </button>
                </div>
              )}
              <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {photos.length} photo{photos.length !== 1 ? 's' : ''} • {Math.round(cluster.confidence_score * 100)}% confident
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className={`text-2xl w-8 h-8 flex items-center justify-center rounded-lg transition ${
              theme === 'dark'
                ? 'hover:bg-gray-700 text-gray-400'
                : 'hover:bg-gray-200 text-gray-600'
            }`}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className={`border-b ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        } flex`}>
          {(['photos', 'add', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab
                  ? theme === 'dark'
                    ? 'border-orange-500 text-orange-400'
                    : 'border-orange-500 text-orange-600'
                  : theme === 'dark'
                    ? 'border-transparent text-gray-400 hover:text-gray-300'
                    : 'border-transparent text-gray-600 hover:text-gray-700'
              }`}
            >
              {tab === 'photos' && 'photos'}
              {tab === 'add' && 'add'}
              {tab === 'settings' && 'settings'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className={`p-6 max-h-96 overflow-y-auto`}>
          {/* Photos Tab */}
          {activeTab === 'photos' && (
            <div>
              {photosLoading ? (
                <div className="text-center py-8">
                  <div className={`w-6 h-6 border-3 border-t-orange-500 rounded-full animate-spin mx-auto ${
                    theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                  }`}></div>
                </div>
              ) : photos.length === 0 ? (
                <p className={`text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  no photos in this cluster
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {photos.map((photo, index) => (
                    <div 
                      key={`${cluster.id}-${photo.id}-${index}`} 
                      className="relative group cursor-pointer"
                      onMouseEnter={() => setHoveredPhotoId(photo.id)}
                      onMouseLeave={() => setHoveredPhotoId(null)}
                    >
                      {/* Square container with aspect ratio */}
                      <div className={`relative w-full aspect-square rounded-lg overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'}`}>
                        <div style={{ transform: `rotate(${photoRotations[photo.id] || 0}deg)` }} className="absolute inset-0 transition-transform">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.thumbnail}
                            alt="Face photo"
                            className="w-full h-full object-cover hover:opacity-80 transition"
                            onClick={() => setSelectedPhoto(photo)}
                          />
                        </div>
                      </div>
                      
                      {/* Rotate Controls (on hover) */}
                      {hoveredPhotoId === photo.id && (
                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRotatePhoto(photo.id, 'ccw');
                            }}
                            className="p-1 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition text-xs shadow-lg"
                            title="rotate left"
                          >
                            ↶
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRotatePhoto(photo.id, 'cw');
                            }}
                            className="p-1 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition text-xs shadow-lg"
                            title="rotate right"
                          >
                            ↷
                          </button>
                        </div>
                      )}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePhoto(photo.id);
                          setSelectedPhoto(null);
                        }}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        title="Remove from person"
                      >
                        ✕
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetProfilePic(photo.id);
                        }}
                        className="absolute top-1 left-1 text-xs px-2 py-1 bg-yellow-500 text-white rounded opacity-0 group-hover:opacity-100 transition"
                        title="Set as profile picture"
                      >
                        set pfp
                      </button>
                      <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {Math.round(photo.similarity_score * 100)}%
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add Tab */}
          {activeTab === 'add' && (
            <div className={`text-center py-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              {uploadSuccess ? (
                <p className="mb-4 text-green-600 font-semibold">photo added successfully!</p>
              ) : (
                <>
                  <p className="mb-4">add photos to this person</p>
              <button
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.multiple = true;
                  input.accept = 'image/*';
                  input.onchange = async (e: Event) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (!files) return;
                    
                    for (let i = 0; i < files.length; i++) {
                      try {
                        const file = files[i];
                        const formData = new FormData();
                        formData.append('file', file);
                        
                        const uploadUrl = new URL(apiUrl('/api/files/upload'), window.location.origin);
                        const siloName = activeSiloName || 'default';
                        uploadUrl.searchParams.append('silo_name', siloName);
                        uploadUrl.searchParams.append('cluster_id', cluster.id);
                        
                        const uploadResponse = await fetch(uploadUrl.toString(), {
                          method: 'POST',
                          body: formData
                        });
                        
                        if (!uploadResponse.ok) {
                          const errorText = await uploadResponse.text();
                          console.error(`Failed to upload ${file.name}: ${uploadResponse.status} ${errorText}`);
                          continue;
                        }
                        
                        const uploadedFile = await uploadResponse.json();
                        console.log('[FaceDetailView] Upload response:', uploadedFile);
                        if (uploadedFile.media_id) {
                          console.log('[FaceDetailView] Adding photo', uploadedFile.media_id, 'to cluster', cluster.id);
                          await addPhotoToCluster(cluster.id, uploadedFile.media_id.toString());
                          console.log('[FaceDetailView] Successfully added photo to cluster');
                          
                          // Show success message and reload photos
                          setUploadSuccess(true);
                          setTimeout(() => {
                            const data = await getClusterPhotos(cluster.id);
                            setPhotos(data);
                            setActiveTab('photos');
                            setUploadSuccess(false);
                          }, 1000);
                        } else {
                          console.warn('[FaceDetailView] Upload response missing media_id:', uploadedFile);
                        }
                      } catch (error) {
                        console.error('Error adding photo:', error);
                      }
                    }
                  };
                  input.click();
                }}
                className={`px-4 py-2 rounded-lg font-medium ${
                  theme === 'dark'
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
              >
                browse photos
              </button>
                </>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-gray-700">
                <label className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                  show in people tab
                </label>
                <button
                  onClick={async () => {
                    await hideCluster(cluster.id, true);
                    onUpdated();
                  }}
                  className={`px-3 py-1 rounded text-sm font-medium transition ${
                    theme === 'dark'
                      ? 'bg-gray-600 hover:bg-gray-500 text-gray-100'
                      : 'bg-gray-300 hover:bg-gray-400 text-gray-900'
                  }`}
                >
                  hide
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`border-t ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        } p-6 flex gap-3 justify-end`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              theme === 'dark'
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-100'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
            }`}
          >
            x
          </button>
        </div>

        {/* Photo Modal */}
        {selectedPhoto && (
          <PeoplePhotoModal
            isOpen={!!selectedPhoto}
            media={{
              id: selectedPhoto.id,
              image_path: null,
              thumbnail: selectedPhoto.thumbnail,
              rotation: photoRotations[selectedPhoto.id] || 0
            }}
            currentClusterId={cluster.id}
            currentClusterName={cluster.name || undefined}
            allClusters={allClusters}
            onMoveCluster={handleMoveCluster}
            onSetProfilePic={handleSetProfilePic}
            onAddToMultipleClusters={handleAddToMultipleClusters}
            onNavigatePrev={handleNavigatePrev}
            onNavigateNext={handleNavigateNext}
            canNavigatePrev={canNavigatePrev}
            canNavigateNext={canNavigateNext}
            onUpdated={onUpdated}
            onToggleFavorite={(mediaId: number) => {
              if (isFavorite(mediaId)) {
                removeFavorite(mediaId);
              } else {
                addFavorite(mediaId);
              }
            }}
            isFavorite={isFavorite}
            onConfirm={async () => {
              if (selectedPhoto) {
                await handleConfirmPhoto(selectedPhoto.id);
              }
            }}
            onClose={() => setSelectedPhoto(null)}
            onRemove={async () => {
              try {
                await handleRemovePhoto(selectedPhoto.id);
                setSelectedPhoto(null);
              } catch (error) {
                console.error('Failed to remove photo:', error);
              }
            }}
            theme={theme}
          />
        )}

        {/* merge cluster Dialog */}
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
                  merge cluster: &quot;{cluster.name || 'Unnamed'}&quot;
                </h2>
              </div>

              <div
                className={`px-6 py-4 max-h-96 overflow-y-auto ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}
              >
                <p className="mb-4 text-sm">
                  select which cluster to merge this cluster&apos;s images into:
                </p>

                <div className={`space-y-2 border rounded ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  {allClusters.filter(c => c.id !== cluster.id).length === 0 ? (
                    <p className={`px-4 py-3 text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                      No other clusters available to merge into
                    </p>
                  ) : (
                    allClusters
                      .filter(c => c.id !== cluster.id)
                      .map((targetCluster) => (
                        <label
                          key={targetCluster.id}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${
                            selectedTargetCluster === targetCluster.id
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
                            name="targetCluster"
                            value={targetCluster.id}
                            checked={selectedTargetCluster === targetCluster.id}
                            onChange={(e) => setSelectedTargetCluster(e.target.value)}
                            className="cursor-pointer"
                          />
                          <div>
                            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                              {targetCluster.name || 'Unnamed'}
                            </p>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                              {targetCluster.photo_count || 0} photo{targetCluster.photo_count !== 1 ? 's' : ''}
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
                  onClick={handleMergeCluster}
                  disabled={!selectedTargetCluster || isMerging}
                  className={`flex-1 px-4 py-2 rounded font-medium transition disabled:opacity-50 ${
                    theme === 'dark'
                      ? 'bg-orange-600 hover:bg-orange-700 text-white'
                      : 'bg-orange-500 hover:bg-orange-600 text-white'
                  }`}
                >
                  {isMerging ? '⟳ merging...' : '✓ merge'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
