/**
 * AnimalDetailView Component - Modal for detailed animal management
 */

import React, { useState, useEffect } from 'react';
import AnimalPhotoModal from '@/components/PhotoModal/AnimalPhotoModal';
import type { AnimalCluster, AnimalPhoto, SpeciesType, AnimalCategory } from '@/components/Animals/types';
import { SpeciesSelector } from '@/components/Animals/SpeciesSelector';
import {
  getSpeciesEmoji,
  getSpeciesLabel,
  getCategoryLabel,
} from '@/components/Animals/utils/species';

interface AnimalDetailViewProps {
  animal: AnimalCluster | null;
  photos: AnimalPhoto[];
  loading: boolean;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onSpeciesChange: (species: SpeciesType | null) => void;
  onCategoryChange: (category: AnimalCategory) => void;
  onPhotoRemove: (photoIds: string[]) => void;
}

export const AnimalDetailView: React.FC<AnimalDetailViewProps> = ({
  animal,
  photos,
  loading,
  onClose,
  onNameChange,
  onSpeciesChange,
  onCategoryChange,
  onPhotoRemove,
}) => {
  const [activeTab, setActiveTab] = useState<'photos' | 'profile' | 'add'>('photos');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(animal?.name || '');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [selectedPhotoForModal, setSelectedPhotoForModal] = useState<AnimalPhoto | null>(null);

  if (!animal) return null;

  if (editingName && nameInput !== animal.name) {
    setEditingName(false);
  }

  const handleNameSave = () => {
    onNameChange(nameInput);
    setEditingName(false);
  };

  const handleTogglePhotoSelection = (photoId: string) => {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const handleRemoveSelected = () => {
    if (selectedPhotos.size > 0) {
      onPhotoRemove(Array.from(selectedPhotos));
      setSelectedPhotos(new Set());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 p-6 bg-gray-50 flex items-start justify-between">
          <div className="flex items-start gap-4 flex-1">
            {/* Thumbnail */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 border-2 border-gray-300">
              <img
                src={animal.primary_thumbnail}
                alt={animal.name || 'Animal'}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Name and Info */}
            <div className="flex-1">
              {editingName ? (
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleNameSave();
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    autoFocus
                    className="flex-1 px-3 py-2 border border-orange-500 rounded-lg focus:outline-none"
                    placeholder="Enter animal name"
                  />
                  <button
                    onClick={handleNameSave}
                    className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <h2
                  onClick={() => setEditingName(true)}
                  className="text-2xl font-bold text-gray-900 mb-1 cursor-pointer hover:text-orange-600 transition-colors"
                >
                  {animal.name ? (
                    <>
                      {animal.name}{' '}
                      <span className="text-4xl inline-block ml-2">
                        {getSpeciesEmoji(animal.species)}
                      </span>
                    </>
                  ) : (
                    <>
                      Unnamed Animal{' '}
                      <span className="text-4xl inline-block ml-2">
                        {getSpeciesEmoji(animal.species)}
                      </span>
                    </>
                  )}
                </h2>
              )}

              <div className="text-sm text-gray-600 space-y-1">
                <div>
                  Species: <span className="font-semibold">{getSpeciesLabel(animal.species)}</span>
                </div>
                <div>
                  Category: <span className="font-semibold">{getCategoryLabel(animal.category)}</span>
                </div>
                <div>
                  Photos: <span className="font-semibold">{animal.photo_count}</span>
                </div>
                <div>
                  Confidence:{' '}
                  <span className="font-semibold">
                    {Math.round(animal.detection_confidence * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6 pt-4 flex gap-4">
          {(['photos', 'profile', 'add'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'photos' && '📷 Photos'}
              {tab === 'profile' && '⚙️ Profile'}
              {tab === 'add' && '➕ Add Photos'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="text-gray-500">Loading...</div>
            </div>
          ) : activeTab === 'photos' ? (
            <div>
              {/* Batch Actions */}
              {selectedPhotos.size > 0 && (
                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
                  <span className="text-sm font-medium text-orange-900">
                    {selectedPhotos.size} photo{selectedPhotos.size !== 1 ? 's' : ''} selected
                  </span>
                  <button
                    onClick={handleRemoveSelected}
                    className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors"
                  >
                    remove selected
                  </button>
                </div>
              )}

              {/* Photos Grid */}
              <div className="grid grid-cols-4 gap-4">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                      selectedPhotos.has(photo.id)
                        ? 'border-orange-500 scale-95'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                    onClick={() => {
                      if (!selectedPhotos.has(photo.id)) {
                        setSelectedPhotoForModal(photo);
                      } else {
                        handleTogglePhotoSelection(photo.id);
                      }
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbnail}
                      alt="Animal photo"
                      className="w-full h-32 object-cover"
                    />

                    {/* Checkbox */}
                    {selectedPhotos.has(photo.id) && (
                      <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                        <div className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                          ✓
                        </div>
                      </div>
                    )}

                    {/* Detection Score */}
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-2 py-1 rounded">
                      {Math.round(photo.detection_score * 100)}%
                    </div>

                    {/* Face Count */}
                    {photo.face_count > 1 && (
                      <div className="absolute top-1 left-1 bg-orange-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                        {photo.face_count}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {photos.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No photos yet for this animal
                </div>
              )}
            </div>
          ) : activeTab === 'profile' ? (
            <div className="space-y-6">
              <SpeciesSelector
                species={animal.species}
                category={animal.category}
                onSpeciesChange={onSpeciesChange}
                onCategoryChange={onCategoryChange}
                showLabel={true}
              />

              {/* Breed Suggestion */}
              {animal.breed_suggestion && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="text-sm font-semibold text-orange-900 mb-2">
                    Suggested Breed
                  </div>
                  <div className="text-orange-800">{animal.breed_suggestion}</div>
                </div>
              )}

              {/* Profile Stats */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Statistics</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>
                    Total Photos: <span className="font-semibold text-gray-900">{animal.photo_count}</span>
                  </div>
                  <div>
                    Last Detected: <span className="font-semibold text-gray-900">{new Date(animal.last_detected).toLocaleDateString()}</span>
                  </div>
                  <div>
                    Detection Confidence:{' '}
                    <span className="font-semibold text-gray-900">
                      {Math.round(animal.detection_confidence * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-semibold text-red-600 mb-3">Danger Zone</h3>
                <button className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium transition-colors">
                  Delete This Animal
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Add photos feature coming soon
            </div>
          )}
        </div>
      </div>

      {/* Photo Modal */}
      {selectedPhotoForModal && animal && (
        <AnimalPhotoModal
          isOpen={!!selectedPhotoForModal}
          media={{
            id: selectedPhotoForModal.id,
            image_path: '',
            thumbnail: selectedPhotoForModal.thumbnail,
            rotation: 0
          }}
          currentClusterId={animal.id}
          currentClusterName={animal.name || undefined}
          allClusters={[]}
          onClose={() => setSelectedPhotoForModal(null)}
          onMoveCluster={async (mediaId, toClusterId) => {
            try {
              await fetch(`/api/animals/${toClusterId}/move-photo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ media_id: mediaId })
              });
              onPhotoRemove([mediaId]);
            } catch (error) {
              console.error('Failed to move photo:', error);
            }
          }}
        />
      )}
    </div>
  );
};
