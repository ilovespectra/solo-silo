'use client';

import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSilos } from '@/hooks/useSilos';
import { useFaceClusters, FaceCluster } from './hooks/useFaceClusters';
import FaceClusterCard from './FaceClusterCard';
import FaceDetailView from './FaceDetailView';
import { reclusterFaces, getReclusterStatus } from '@/lib/backend';

type SortBy = 'photo_count' | 'recent' | 'name';

interface ClusteringState {
  isRunning: boolean;
  progress: number;
  status: string;
  logs: string[];
}

export default function PeoplePane() {
  const theme = useAppStore((state) => state.theme);
  const { activeSilo } = useSilos();
  const { clusters, loading, error, fetchClusters, rotateClusterThumbnail, getClusterPhotos } = useFaceClusters();
  const [sortBy, setSortBy] = useState<SortBy>('photo_count');
  const [showHidden, setShowHidden] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<FaceCluster | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cluster: FaceCluster } | null>(null);
  const [cachingFaces, setCachingFaces] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [clusteringState, setClusteringState] = useState<ClusteringState>({
    isRunning: false,
    progress: 0,
    status: 'idle',
    logs: [],
  });
  const [showClusteringModal, setShowClusteringModal] = useState(false);
  const [allClustersConfirmed, setAllClustersConfirmed] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Auto-refresh when indexing completes
  useEffect(() => {
    const handleIndexingComplete = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('[PeoplePane] Indexing complete event received:', customEvent.detail);
      console.log('[PeoplePane] Refreshing face clusters...');
      
      // Force refresh to clear cache and get latest data
      fetchClusters(showHidden, true);
    };

    window.addEventListener('indexing-complete', handleIndexingComplete);
    
    return () => {
      window.removeEventListener('indexing-complete', handleIndexingComplete);
    };
  }, [fetchClusters, showHidden]);

  // Auto-refresh when clustering completes
  useEffect(() => {
    const handleClusteringComplete = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('[PeoplePane] Clustering complete event received:', customEvent.detail);
      console.log('[PeoplePane] Refreshing face clusters after clustering...');
      
      // Force refresh to clear cache and display new clusters
      fetchClusters(showHidden, true);
    };

    window.addEventListener('clustering-complete', handleClusteringComplete);
    
    return () => {
      window.removeEventListener('clustering-complete', handleClusteringComplete);
    };
  }, [fetchClusters, showHidden]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [clusteringState.logs]);

  useEffect(() => {
    const checkAllClustersConfirmed = async () => {
      try {
        if (!clusters || clusters.length === 0) {
          setAllClustersConfirmed(false);
          return;
        }

        let allConfirmed = true;
        for (const cluster of clusters) {
          const photos = await getClusterPhotos(cluster.id);
          const hasUnconfirmed = photos.some(photo => !photo.is_confirmed);
          if (hasUnconfirmed) {
            allConfirmed = false;
            break;
          }
        }
        setAllClustersConfirmed(allConfirmed);
      } catch (err) {
        console.error('Failed to check cluster confirmations:', err);
        setAllClustersConfirmed(false);
      }
    };

    checkAllClustersConfirmed();
  }, [clusters, getClusterPhotos]);

  const handleRotateCluster = async (clusterId: string, rotation: number) => {
    try {
      await rotateClusterThumbnail(clusterId, rotation);
      if (selectedCluster && selectedCluster.id === clusterId) {
        setSelectedCluster((prev) => prev ? { ...prev, rotation_override: rotation } : null);
      }
    } catch (err) {
      console.error('Failed to rotate cluster:', err);
    }
  };

  const handleRecluster = async () => {
    try {
      setShowClusteringModal(true);
      setClusteringState({
        isRunning: true,
        progress: 0,
        status: 'starting',
        logs: [],
      });

      const result = await reclusterFaces(activeSilo?.name);

      setClusteringState((prev) => ({
        ...prev,
        isRunning: false,
        progress: 100,
        status: 'complete',
        logs: [...prev.logs, ...result.logs],
      }));

      setTimeout(async () => {
        await fetchClusters(showHidden, true);
        setCacheMessage(`✓ Re-clustering complete: ${result.clusters_with_3plus} clusters with 3+ photos`);
        setTimeout(() => setCacheMessage(null), 4000);
      }, 1000);
    } catch (err) {
      console.error('Failed to recluster:', err);
      setClusteringState((prev) => ({
        ...prev,
        isRunning: false,
        status: 'error',
        logs: [...prev.logs, `✗ Error: ${err instanceof Error ? err.message : 'Unknown error'}`],
      }));
      setCacheMessage('✗ Re-clustering failed');
    }
  };

  useEffect(() => {
    if (!clusteringState.isRunning) return;

    const interval = setInterval(async () => {
      try {
        const status = await getReclusterStatus(activeSilo?.name);
        setClusteringState({
          isRunning: status.is_running,
          progress: status.progress,
          status: status.status,
          logs: status.logs,
        });
      } catch (err) {
        console.error('Failed to get clustering status:', err);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [clusteringState.isRunning]);

  const handleCacheFaces = async () => {
    try {
      setCachingFaces(true);
      setCacheMessage(null);
      
      const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
      const response = await fetch(`/api/cache/rebuild-people-clusters${siloParam}`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to cache faces');
      }
      
      const data = await response.json();
      setCacheMessage(`✓ Cached ${data.clusters} people clusters for faster search`);
      
      const siloKey = activeSilo?.name ? `-${activeSilo.name}` : '';
      localStorage.setItem(`facesCached${siloKey}`, 'true');
      
      setTimeout(() => setCacheMessage(null), 3000);
    } catch (err) {
      console.error('Failed to cache faces:', err);
      setCacheMessage('✗ Failed to cache faces');
    } finally {
      setCachingFaces(false);
    }
  };

  const handleRefreshClusters = async () => {
    try {
      console.log('[PeoplePane] Refreshing clusters...');
      await fetchClusters(showHidden, true);
      setCacheMessage('✓ Clusters refreshed');
      setTimeout(() => setCacheMessage(null), 2000);
    } catch (err) {
      console.error('Failed to refresh clusters:', err);
      setCacheMessage('✗ Failed to refresh clusters');
    }
  };

  useEffect(() => {
    // Fetch clusters on mount if they're not already loaded
    // This handles page refresh after indexing completes
    if (clusters.length === 0 && !loading) {
      console.log('[PeoplePane] Initial mount - fetching clusters');
      fetchClusters(showHidden, false);
    }
  }, [showHidden, fetchClusters, clusters.length, loading]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sortedClusters = [...clusters].sort((a, b) => {
    switch (sortBy) {
      case 'photo_count':
        return b.photo_count - a.photo_count;
      case 'recent':
        return new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime();
      case 'name':
        return (a.name || 'Z').localeCompare(b.name || 'Z');
      default:
        return 0;
    }
  });

  const visibleClusters = sortedClusters.filter(c => !c.is_hidden);
  const hiddenClusters = sortedClusters.filter(c => c.is_hidden);

  return (
    <div className="w-full h-full overflow-hidden flex flex-col">
      <div className={`flex-1 overflow-y-auto hide-scrollbar lowercase ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'} p-8`}>
        <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            people
          </h1>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            {visibleClusters.length} people detected
            {hiddenClusters.length > 0 && ` (${hiddenClusters.length} hidden)`}
          </p>
        </div>

        {/* Controls */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex gap-4 items-center">
            {/* Sort Dropdown */}
            <div>
              <label className={`text-sm font-medium mr-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                Sort by:
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className={`px-3 py-2 lowercase rounded-lg border transition ${
                  theme === 'dark'
                    ? 'bg-gray-800 border-gray-700 text-white lowercase'
                    : 'bg-white border-gray-300 text-gray-900 lowercase'
                }`}
              >
                <option value="photo_count">Most Photos</option>
                <option value="recent">Recently Updated</option>
                <option value="name">Alphabetical</option>
              </select>
            </div>

            {/* Show Hidden Toggle */}
            {hiddenClusters.length > 0 && (
              <button
                onClick={() => setShowHidden(!showHidden)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  showHidden
                    ? theme === 'dark'
                      ? 'bg-orange-600 text-white'
                      : 'bg-orange-500 text-white'
                    : theme === 'dark'
                      ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {showHidden ? '👁️ Hide Hidden' : `👁️‍🗨️ Show Hidden (${hiddenClusters.length})`}
              </button>
            )}

            {/* Cache Faces Button */}
            <div className="relative group">
              <button
                onClick={handleCacheFaces}
                disabled={cachingFaces || !allClustersConfirmed}
                title="Capture current people clusters for faster search"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  cachingFaces || !allClustersConfirmed
                    ? theme === 'dark'
                      ? 'bg-gray-700 text-gray-400'
                      : 'bg-gray-300 text-gray-500'
                    : theme === 'dark'
                      ? 'bg-orange-900 text-orange-100 hover:bg-orange-800'
                      : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
              >
                {cachingFaces ? 'caching...' : 'cache faces'}
              </button>
              {!allClustersConfirmed && !cachingFaces && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                  confirm all clusters to cache faces
                </div>
              )}
              {cachingFaces && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                  confirm all clusters to help refine your models
                </div>
              )}
            </div>

          </div>

          {/* Cache Message */}
          {cacheMessage && (
            <div className={`text-sm font-medium ${
              cacheMessage.startsWith('✓')
                ? theme === 'dark'
                  ? 'text-orange-400'
                  : 'text-orange-600'
                : theme === 'dark'
                  ? 'text-red-400'
                  : 'text-red-600'
            }`}>
              {cacheMessage}
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="text-center">
              <div className={`w-8 h-8 border-4 border-t-orange-500 rounded-full animate-spin mx-auto mb-4 ${
                theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
              }`}></div>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                loading people...
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className={`p-4 rounded-lg border ${
            theme === 'dark'
              ? 'bg-red-900 border-red-700 text-red-100'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <p className="font-medium">Failed to load people</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && visibleClusters.length === 0 && (
          <div className={`text-center py-12 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            <div className="text-4xl mb-4">👤</div>
            <p className="text-lg font-medium mb-1">No faces detected yet</p>
            <p className="text-sm">
              {hiddenClusters.length > 0 
                ? 'All people are hidden. Restore them to see them here.'
                : 'Start adding photos to detect faces.'}
            </p>
          </div>
        )}

        {/* Main Grid */}
        {!loading && visibleClusters.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 mb-12">
            {visibleClusters.map((cluster) => (
              <FaceClusterCard
                key={cluster.id}
                cluster={cluster}
                onClick={setSelectedCluster}
                onContextMenu={(c, x, y) => setContextMenu({ cluster: c, x, y })}
                onRotate={handleRotateCluster}
                theme={theme}
              />
            ))}
          </div>
        )}

        {/* Hidden Section */}
        {showHidden && hiddenClusters.length > 0 && (
          <div className="mt-16 pt-8 border-t border-gray-300">
            <h2 className={`text-2xl font-bold mb-6 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              👁️‍🗨️ Hidden ({hiddenClusters.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
              {hiddenClusters.map((cluster) => (
                <FaceClusterCard
                  key={cluster.id}
                  cluster={cluster}
                  onClick={setSelectedCluster}
                  onContextMenu={(c, x, y) => setContextMenu({ cluster: c, x, y })}
                  onRotate={handleRotateCluster}
                  theme={theme}
                />
              ))}
            </div>
          </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className={`fixed z-50 rounded-lg shadow-lg border ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200'
            }`}
            style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          >
            <button
              onClick={() => {
                setSelectedCluster(contextMenu.cluster);
                setContextMenu(null);
              }}
              className={`block w-full text-left px-4 py-2 text-sm font-medium first:rounded-t-lg hover:bg-orange-500 hover:text-white transition ${
                theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
              }`}
            >
              ✎ Edit
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedCluster && (
        <FaceDetailView
          cluster={selectedCluster}
          onClose={() => setSelectedCluster(null)}
          theme={theme}
          onUpdated={() => {
            // Force refresh of clusters when photos are added/modified (new people might have been created)
            fetchClusters(showHidden, true).then((updated) => {
              const updated_cluster = updated.find(c => c.id === selectedCluster.id);
              if (updated_cluster) {
                setSelectedCluster(updated_cluster);
              }
            });
          }}
        />
      )}

      {/* Clustering Progress Modal */}
      {showClusteringModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh] ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          }`}>
            {/* Header */}
            <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
              <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                🔄 Re-clustering Faces
              </h2>
              <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                Validating embeddings and merging faces with existing clusters
              </p>
            </div>

            {/* Progress Bar */}
            <div className="px-6 py-4 border-b" style={{ borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}>
              <div className="flex justify-between items-center mb-2">
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  {clusteringState.status === 'validating' && 'Validating embeddings...'}
                  {clusteringState.status === 'loading' && 'Loading faces...'}
                  {clusteringState.status === 'clustering' && 'Clustering faces...'}
                  {clusteringState.status === 'filtering' && 'Filtering results...'}
                  {clusteringState.status === 'complete' && '✓ Complete'}
                  {clusteringState.status === 'error' && '✗ Error'}
                  {clusteringState.status === 'starting' && 'Starting...'}
                </span>
                <span className={`text-sm font-bold ${theme === 'dark' ? 'text-orange-400' : 'text-orange-600'}`}>
                  {clusteringState.progress}%
                </span>
              </div>
              <div className={`w-full h-2 rounded-full overflow-hidden ${
                theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
              }`}>
                <div
                  className={`h-full transition-all duration-300 ${
                    clusteringState.status === 'error'
                      ? 'bg-red-500'
                      : clusteringState.status === 'complete'
                        ? 'bg-green-500'
                        : 'bg-orange-500'
                  }`}
                  style={{ width: `${clusteringState.progress}%` }}
                ></div>
              </div>
            </div>

            {/* Logs */}
            <div className={`flex-1 overflow-y-auto p-6 font-mono text-xs ${
              theme === 'dark' ? 'bg-gray-900 text-gray-200' : 'bg-gray-50 text-gray-800'
            }`}>
              {clusteringState.logs.length === 0 ? (
                <p className={theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}>
                  Initializing...
                </p>
              ) : (
                <>
                  {clusteringState.logs.map((log, idx) => (
                    <div key={idx} className="mb-1 break-all">
                      {log}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </>
              )}
            </div>

            {/* Footer */}
            <div className={`px-6 py-4 border-t flex justify-end gap-2 ${
              theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
            }`}>
              {!clusteringState.isRunning && (
                <button
                  onClick={() => setShowClusteringModal(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    theme === 'dark'
                      ? 'bg-gray-700 text-white hover:bg-gray-600'
                      : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                  }`}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
