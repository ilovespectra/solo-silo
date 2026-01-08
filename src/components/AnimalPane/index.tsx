'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSilos } from '@/hooks/useSilos';
import { fetchAnimals } from '@/lib/backend';

type SortBy = 'appearances' | 'name' | 'hidden';

interface Animal {
  id: string;
  label: string;
  count: number;
  sample: string;
  sample_media_id?: number;
  score: number;
  photos: Array<{
    path: string;
    media_id?: number;
    confidence: number;
  }>;
  hidden: boolean;
  bbox: number[];
}

interface AnimalDetails {
  id: string;
  label: string;
  photos: Array<{
    path: string;
    media_id?: number;
    confidence: number;
  }>;
  count: number;
}

export default function AnimalPane() {
  const theme = useAppStore((state: { theme: string }) => state.theme);
  const { activeSilo } = useSilos();
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('appearances');
  const [selectedAnimal, setSelectedAnimal] = useState<AnimalDetails | null>(null);
  
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnimals(activeSilo?.name);
      setAnimals(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load animals');
    } finally {
      setLoading(false);
    }
  }, [activeSilo?.name]);

  useEffect(() => {
    load();
  }, [activeSilo?.name, load]);

  // Auto-refresh when indexing completes
  useEffect(() => {
    const handleIndexingComplete = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('[AnimalPane] Indexing complete event received:', customEvent.detail);
      console.log('[AnimalPane] Refreshing animals...');
      load();
    };

    window.addEventListener('indexing-complete', handleIndexingComplete);
    
    return () => {
      window.removeEventListener('indexing-complete', handleIndexingComplete);
    };
  }, [load]);

  const handleName = async (id: string) => {
    const name = prompt('Name this animal:');
    if (!name) return;
    
    try {
      const response = await fetch(`/api/animals/${id}/name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to rename animal');
      }
      
      // Update local state immediately
      setAnimals(prev =>
        prev.map(a => a.id === id ? { ...a, label: name } : a)
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to rename animal';
      console.error('Failed to rename animal:', errorMsg);
      setError(errorMsg);
    }
  };

  const handleHide = async (id: string, hidden: boolean) => {
    try {
      const response = await fetch(`/api/animals/${id}/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update animal visibility');
      }
      
      // Update local state immediately
      setAnimals(prev =>
        prev.map(a => a.id === id ? { ...a, hidden } : a)
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update animal visibility';
      console.error('Failed to hide animal:', errorMsg);
      setError(errorMsg);
    }
  };

  const getSortedAnimals = () => {
    const sorted = [...animals];
    switch (sortBy) {
      case 'appearances':
        return sorted.sort((a, b) => (b.count || 0) - (a.count || 0));
      case 'name':
        return sorted.sort((a, b) => 
          (a.label || 'unknown').localeCompare(b.label || 'unknown')
        );
      case 'hidden':
        return sorted.sort((a, b) => {
          const aHidden = a.hidden ? 1 : 0;
          const bHidden = b.hidden ? 1 : 0;
          return bHidden - aHidden;
        });
      default:
        return sorted;
    }
  };

  const bgClass = theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50';
  const textClass = theme === 'dark' ? 'text-white' : 'text-gray-900';
  const cardBgClass = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
  const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-300';
  const secondaryTextClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-600';
  const buttonBgClass = theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300';
  const buttonTextClass = theme === 'dark' ? 'text-white' : 'text-gray-900';

  const sortedAnimals = getSortedAnimals();

  if (selectedAnimal) {
    return (
      <div className={`w-full h-full flex flex-col lowercase ${bgClass}`}>
        <div className={`border-b ${borderClass} p-6 flex items-center justify-between`}>
          <div>
            <h2 className={`text-2xl font-bold ${textClass}`}>{selectedAnimal.label || 'Unknown'}</h2>
            <p className={`${secondaryTextClass} text-sm`}>{selectedAnimal.count} photos</p>
          </div>
          <button
            onClick={() => setSelectedAnimal(null)}
            className={`px-4 py-2 rounded-lg font-semibold transition lowercase ${buttonBgClass} ${buttonTextClass}`}
          >
            ✕ Back
          </button>
        </div>
        
        <div className={`flex-1 overflow-auto p-6`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {selectedAnimal.photos.map((photo, idx) => (
              <div
                key={idx}
                className="relative group cursor-pointer"
              >
                <div className={`w-full aspect-square rounded-lg overflow-hidden border ${borderClass} shadow-sm`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/media/file/${photo.media_id}`}
                    alt="Animal photo"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23ddd' width='200' height='200'/%3E%3Ctext x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='monospace' font-size='16' fill='%23666'%3E📷%3C/text%3E%3C/svg%3E`;
                    }}
                  />
                </div>
                <div className={`absolute top-2 right-2 bg-orange-600 text-white px-2 py-1 rounded text-xs font-semibold`}>
                  {(photo.confidence * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full overflow-auto p-6 ${bgClass}`}>
      <h2 className={`text-2xl font-bold lowercase ${textClass} mb-6`}>animals & pets</h2>
      
      {/* Sort Controls */}
      <div className={`${cardBgClass} border ${borderClass} rounded-lg p-4 mb-6 lowercase`}>
        <p className={`text-sm font-semibold ${textClass} mb-3`}>sort by:</p>
        <div className="flex flex-wrap gap-2">
          {(['appearances', 'name', 'hidden'] as SortBy[]).map((option) => (
            <button
              key={option}
              onClick={() => setSortBy(option)}
              className={`px-4 py-2 rounded text-sm font-semibold transition-colors lowercase ${
                sortBy === option
                  ? 'bg-orange-600 text-white'
                  : `${buttonBgClass} ${buttonTextClass}`
              }`}
            >
              {option === 'appearances' && '📊 Most Photos'}
              {option === 'name' && '🔤 Name'}
              {option === 'hidden' && '👁️ Hidden'}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className={`text-sm ${secondaryTextClass}`}>Loading...</p>}
      {error && <p className={`text-sm text-red-600`}>{error}</p>}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedAnimals.map((a) => (
          <div key={a.id} className={`border ${borderClass} rounded-lg overflow-hidden ${cardBgClass} shadow-sm hover:shadow-md transition-shadow cursor-pointer`} onClick={() => setSelectedAnimal({ id: a.id, label: a.label, photos: a.photos, count: a.count })}>
            <div className={`w-full h-40 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} overflow-hidden`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/file/${a.sample_media_id}`}
                alt={a.label}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23ddd' width='200' height='200'/%3E%3Ctext x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='monospace' font-size='16' fill='%23666'%3E🐾%3C/text%3E%3C/svg%3E`;
                }}
              />
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-base font-semibold ${textClass}`}>{a.label || 'unknown'}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${secondaryTextClass}`}>{a.count} photo{a.count !== 1 ? 's' : ''}</span>
                  {a.hidden && <span className="text-xs opacity-50">👁️</span>}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={(e) => { e.stopPropagation(); handleName(a.id); }}
                  className="px-3 py-2 bg-orange-600 text-white rounded text-sm font-semibold hover:bg-orange-700 transition-colors"
                >
                  ✏️ Name
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleHide(a.id, !a.hidden); }}
                  className={`px-3 py-2 rounded text-sm font-semibold transition-colors ${
                    a.hidden
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : `${buttonBgClass} ${buttonTextClass} hover:bg-opacity-80`
                  }`}
                >
                  {a.hidden ? '👁️ Unhide' : '🚫 Hide'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {sortedAnimals.length === 0 && !loading && (
        <p className={`text-center ${secondaryTextClass} py-12`}>
          no animals detected yet. upload photos and they&apos;ll appear here.
        </p>
      )}
    </div>
  );
}
