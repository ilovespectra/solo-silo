/**
 * useAnimalClusters Hook - Fetch and manage animal clusters
 */

import { useState, useCallback, useEffect } from 'react';
import { useSilos } from '@/hooks/useSilos';
import type {
  AnimalCluster,
  AnimalPhoto,
  AnimalsFilter,
  AnimalsSort,
  AnimalUpdate,
  SpeciesDetectionResult,
  SpeciesType,
  AnimalCategory,
} from '@/components/Animals/types';
import {
  filterBySpecies,
  filterByCategory,
  filterByConfidence,
  sortAnimalsByPhotoCount,
  sortAnimalsByName,
  sortAnimalsByDate,
} from '@/components/Animals/utils/species';

interface UseAnimalClustersReturn {
  clusters: AnimalCluster[];
  filteredClusters: AnimalCluster[];
  selectedCluster: AnimalCluster | null;
  loading: boolean;
  error: string | null;
  filter: AnimalsFilter;
  sort: AnimalsSort;
  setFilter: (filter: Partial<AnimalsFilter>) => void;
  setSort: (sort: Partial<AnimalsSort>) => void;
  selectCluster: (cluster: AnimalCluster) => void;
  deselectCluster: () => void;
  fetchClusters: () => Promise<void>;
  fetchClusterPhotos: (clusterId: string) => Promise<AnimalPhoto[]>;
  updateAnimal: (clusterId: string, updates: AnimalUpdate) => Promise<void>;
  deleteAnimal: (clusterId: string) => Promise<void>;
  suggestSpecies: (clusterId: string) => Promise<SpeciesDetectionResult | null>;
}

export const useAnimalClusters = (): UseAnimalClustersReturn => {
  const { silos, activeSilo } = useSilos();
  const [clusters, setClusters] = useState<AnimalCluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<AnimalCluster | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilterState] = useState<AnimalsFilter>({
    species: 'all',
    category: 'all',
    hideUnconfirmed: false,
    minConfidence: 0.5,
  });
  const [sort, setSortState] = useState<AnimalsSort>({
    by: 'photoCount',
    order: 'desc',
  });

  const filteredClusters = clusters
    .filter((c) => !c.is_hidden || filter.species !== 'all')
    .filter((c) => filterBySpecies(filter.species as SpeciesType | 'all', c.species))
    .filter((c) => filterByCategory(filter.category as AnimalCategory | 'all', c.category))
    .filter((c) => filterByConfidence(c.detection_confidence, filter.minConfidence))
    .sort((a, b) => {
      switch (sort.by) {
        case 'photoCount':
          return sortAnimalsByPhotoCount(a, b, sort.order);
        case 'alphabetical':
          return sortAnimalsByName(a, b, sort.order);
        case 'recentlyAdded':
          return sortAnimalsByDate(a, b, sort.order);
        default:
          return 0;
      }
    });

  const setFilter = useCallback((updates: Partial<AnimalsFilter>) => {
    setFilterState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setSort = useCallback((updates: Partial<AnimalsSort>) => {
    setSortState((prev) => ({ ...prev, ...updates }));
  }, []);

  const selectCluster = useCallback((cluster: AnimalCluster) => {
    setSelectedCluster(cluster);
  }, []);

  const deselectCluster = useCallback(() => {
    setSelectedCluster(null);
  }, []);

  const fetchClusters = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (silos.length > 0) params.append('silos', silos.map(s => s.name).join(','));
      
      const response = await fetch(`/api/animals/clusters?${params}`);
      if (!response.ok) throw new Error('failed to fetch animal clusters');

      const data = await response.json();
      setClusters(data.clusters || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setClusters([]);
    } finally {
      setLoading(false);
    }
  }, [silos]);

  const fetchClusterPhotos = useCallback(
    async (clusterId: string): Promise<AnimalPhoto[]> => {
      try {
        const params = new URLSearchParams();
        if (silos.length > 0) params.append('silos', silos.map(s => s.name).join(','));
        
        const response = await fetch(`/api/animals/${clusterId}/photos?${params}`);
        if (!response.ok) throw new Error('failed to fetch cluster photos');

        const data = await response.json();
        return data.photos || [];
      } catch (err) {
        console.error('Error fetching cluster photos:', err);
        return [];
      }
    },
    [silos]
  );

  const updateAnimal = useCallback(
    async (clusterId: string, updates: AnimalUpdate) => {
      setClusters((prev) =>
        prev.map((c) =>
          c.id === clusterId
            ? {
                ...c,
                name: updates.name ?? c.name,
                species: updates.species !== undefined ? updates.species : c.species,
                category: updates.category ?? c.category,
                is_hidden: updates.is_hidden ?? c.is_hidden,
              }
            : c
        )
      );

      if (selectedCluster?.id === clusterId) {
        setSelectedCluster((prev) =>
          prev
            ? {
                ...prev,
                name: updates.name ?? prev.name,
                species: updates.species !== undefined ? updates.species : prev.species,
                category: updates.category ?? prev.category,
                is_hidden: updates.is_hidden ?? prev.is_hidden,
              }
            : null
        );
      }

      try {
        const response = await fetch(`/api/animals/${clusterId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!response.ok) throw new Error('Failed to update animal');

        const data = await response.json();
        if (data.animal) {
          setClusters((prev) =>
            prev.map((c) => (c.id === clusterId ? data.animal : c))
          );
          if (selectedCluster?.id === clusterId) {
            setSelectedCluster(data.animal);
          }
        }
      } catch (err) {
        console.error('Error updating animal:', err);
        setError(err instanceof Error ? err.message : 'Failed to update animal');
        await fetchClusters();
      }
    },
    [selectedCluster?.id, fetchClusters]
  );

  const deleteAnimal = useCallback(
    async (clusterId: string) => {
      try {
        const response = await fetch(`/api/animals/${clusterId}`, {
          method: 'DELETE',
        });

        if (!response.ok) throw new Error('Failed to delete animal');

        setClusters((prev) => prev.filter((c) => c.id !== clusterId));
        if (selectedCluster?.id === clusterId) {
          deselectCluster();
        }
      } catch (err) {
        console.error('Error deleting animal:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete animal');
      }
    },
    [selectedCluster?.id, deselectCluster]
  );

  const suggestSpecies = useCallback(
    async (clusterId: string): Promise<SpeciesDetectionResult | null> => {
      try {
        const response = await fetch(`/api/animals/${clusterId}/species-suggestion`);
        if (!response.ok) return null;

        const data = await response.json();
        return data.suggestion || null;
      } catch (err) {
        console.error('Error suggesting species:', err);
        return null;
      }
    },
    []
  );

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  return {
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
    deleteAnimal,
    suggestSpecies,
  };
};
