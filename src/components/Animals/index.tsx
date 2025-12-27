/**
 * AnimalsTab Component - Main animals management interface
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useAnimalClusters, useAnimalActions } from '@/components/Animals/hooks';
import { AnimalClusterCard } from '@/components/Animals/AnimalClusterCard';
import { AnimalDetailView } from '@/components/Animals/AnimalDetailView';
import type { AnimalPhoto, SpeciesType, AnimalCategory } from '@/components/Animals/types';
import { SPECIES_OPTIONS, CATEGORY_OPTIONS } from '@/components/Animals/utils/species';

interface AnimalsTabProps {
  devMode?: boolean;
}

export const AnimalsTab: React.FC<AnimalsTabProps> = ({ devMode = false }) => {
  const {
    clusters,
    filteredClusters,
    selectedCluster,
    loading,
    error,
    filter,
    sort,
    setFilter,
    setSort,
    selectCluster,
    deselectCluster,
    fetchClusters,
    fetchClusterPhotos,
    updateAnimal,
  } = useAnimalClusters();

  const { loadingAction } = useAnimalActions();

  const [photos, setPhotos] = useState<AnimalPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  useEffect(() => {
    if (selectedCluster) {
      const loadPhotos = async () => {
        setPhotosLoading(true);
        try {
          const clusterPhotos = await fetchClusterPhotos(selectedCluster.id);
          setPhotos(clusterPhotos);
        } finally {
          setPhotosLoading(false);
        }
      };
      loadPhotos();
    } else {
      setPhotos([]);
      setPhotosLoading(false);
    }
  }, [selectedCluster, fetchClusterPhotos]);

  const handleDetailClose = () => {
    setPhotos([]);
    deselectCluster();
  };

  const handleNameChange = async (name: string) => {
    if (selectedCluster) {
      await updateAnimal(selectedCluster.id, { name: name || undefined });
    }
  };

  const handleSpeciesChange = async (species: SpeciesType | null) => {
    if (selectedCluster) {
      await updateAnimal(selectedCluster.id, { species });
    }
  };

  const handleCategoryChange = async (category: AnimalCategory) => {
    if (selectedCluster) {
      await updateAnimal(selectedCluster.id, { category });
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-6 bg-gray-50">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Animals</h1>
        <p className="text-gray-600 mb-4">
          Manage your detected animal clusters, name them, and organize by species.
        </p>

        {/* Filters and Sorting */}
        <div className="flex flex-wrap gap-4 items-center">
          {/* Species Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-700">Species:</label>
            <select
              value={filter.species}
              onChange={(e) => setFilter({ species: e.target.value as SpeciesType | 'all' })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Species</option>
              {SPECIES_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.emoji} {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-700">Category:</label>
            <select
              value={filter.category}
              onChange={(e) => setFilter({ category: e.target.value as AnimalCategory | 'all' })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Categories</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.emoji} {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-700">Sort:</label>
            <select
              value={sort.by}
              onChange={(e) =>
                setSort({ by: e.target.value as 'photoCount' | 'recentlyAdded' | 'alphabetical' })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="photoCount">Most Photos</option>
              <option value="recentlyAdded">Recently Added</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchClusters()}
            disabled={loading}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300 text-sm font-medium transition-colors"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Results count */}
        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredClusters.length} of {clusters.length} animals
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
              <div className="text-gray-600">Loading animals...</div>
            </div>
          </div>
        ) : filteredClusters.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <div className="text-3xl mb-2">🐾</div>
              <div className="font-semibold">No animals detected yet</div>
              <div className="text-sm mt-1">Enable animal detection in settings to get started</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {filteredClusters.map((animal) => (
              <AnimalClusterCard
                key={animal.id}
                animal={animal}
                onSelect={selectCluster}
                selected={selectedCluster?.id === animal.id}
                showDetails={true}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedCluster && (
        <AnimalDetailView
          animal={selectedCluster}
          photos={photos}
          loading={photosLoading || loadingAction}
          onClose={handleDetailClose}
          onNameChange={handleNameChange}
          onSpeciesChange={handleSpeciesChange}
          onCategoryChange={handleCategoryChange}
          onPhotoRemove={async () => {
          }}
        />
      )}

      {/* Dev Mode Info */}
      {devMode && (
        <div className="border-t border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 font-mono">
          <div>Showing: {filteredClusters.length} animals</div>
          <div>Filter: {JSON.stringify(filter)}</div>
          <div>Sort: {JSON.stringify(sort)}</div>
          <div>Selected: {selectedCluster?.id || 'None'}</div>
        </div>
      )}
    </div>
  );
};

export default AnimalsTab;
