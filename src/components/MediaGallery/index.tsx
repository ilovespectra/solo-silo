'use client';

import { useEffect, useState, useRef } from 'react';
import { fetchMediaByDate } from '@/lib/backend';
import { useAppStore } from '@/store/appStore';
import { useSilos } from '@/hooks/useSilos';
import BasePhotoModal from '@/components/PhotoModal/BasePhotoModal';
import FolderGrid from '@/components/FileBrowser/FolderGrid';
import SelectionRectangle from '@/components/SelectionRectangle/SelectionRectangle';
import { useFileSelection } from '@/hooks/useFileSelection';

import { trackFileViewed, trackFileAdded, getRecentlyViewed, getRecentlyAdded } from '@/lib/imageCache';

interface MediaItem {
  id: number;
  path: string;
  type: string;
  date_taken?: number;
  size?: number;
  rotation?: number;
}

interface DateGroup {
  date_taken: number | null;
  items: MediaItem[];
}

interface YearGroup {
  year: number;
  months: MonthGroup[];
}

interface MonthGroup {
  year: number;
  month: number;
  monthName: string;
  items: MediaItem[];
}

type ViewMode = 'grid' | 'list';
type SortField = 'date' | 'name' | 'size' | 'type';
type SortOrder = 'asc' | 'desc';
type GallerySort = 'date-newest' | 'date-oldest' | 'size-largest' | 'size-smallest';

// Lazy loading wrapper component for individual grid items
function LazyMediaItem({ 
  item, 
  isSelected, 
  handleThumbnailClick, 
  handleMediaDragStart, 
  getFileIcon, 
  isVideo, 
  isFavorite, 
  theme, 
  activeSilo 
}: {
  item: MediaItem;
  isSelected: boolean;
  handleThumbnailClick: (id: number, e: React.MouseEvent) => void;
  handleMediaDragStart: (e: React.DragEvent, item: MediaItem) => void;
  getFileIcon: (type: string, size: number) => string;
  isVideo: (type: string) => boolean;
  isFavorite: (id: number) => boolean;
  theme: string;
  activeSilo: any;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '50px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-media-item={item.id}
      data-item-id={item.id}
      data-selectable="true"
      className={`group relative aspect-square rounded-lg overflow-hidden cursor-pointer transition ${
        isSelected 
          ? theme === 'dark'
            ? 'ring-2 ring-orange-500 bg-orange-900 bg-opacity-20'
            : 'ring-2 ring-orange-500 bg-orange-50'
          : theme === 'dark'
          ? 'hover:ring-2 hover:ring-orange-500 bg-gray-800'
          : 'hover:ring-2 hover:ring-orange-400 bg-gray-100'
      }`}
      onClick={(e) => {
        if (!e.defaultPrevented) {
          handleThumbnailClick(item.id, e);
        }
      }}
      onDragStart={(e) => handleMediaDragStart(e, item)}
      draggable={isSelected}
    >
      {/* Loading Placeholder */}
      <div className={`absolute inset-0 animate-pulse ${
        theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
      }`} />

      {/* Lazy Loaded Content */}
      {isVisible && (
        <div className="w-full h-full absolute inset-0">
          <img
            src={`/api/media/thumbnail/${item.id}?size=200&square=true&rotation=${item.rotation || 0}${activeSilo?.name ? `&silo_name=${encodeURIComponent(activeSilo.name)}` : ''}`}
            alt="Thumbnail"
            className="w-full h-full object-cover group-hover:scale-105 transition"
            loading="lazy"
            decoding="async"
            onLoad={(e) => {
              e.currentTarget.style.zIndex = '10';
              const placeholder = e.currentTarget.parentElement?.previousElementSibling as HTMLElement;
              if (placeholder) {
                placeholder.style.display = 'none';
              }
            }}
            onError={(e) => {
              e.currentTarget.src = getFileIcon(item.type, 200);
            }}
          />
        </div>
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 transition"></div>

      {/* Video Badge */}
      {isVisible && isVideo(item.type) && (
        <div className="absolute top-2 right-2 bg-black bg-opacity-60 text-white px-2 py-1 rounded text-xs font-semibold">
          🎬
        </div>
      )}

      {/* Favorite Badge */}
      {isVisible && isFavorite(item.id) && (
        <div className="absolute top-2 left-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#f59e0b', opacity: 0.8 }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </div>
      )}

      {/* Click Hint */}
      {isVisible && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-2 opacity-0 group-hover:opacity-100 transition">
          <p className="text-white text-xs font-medium">Double-click to view • Click to select</p>
        </div>
      )}
    </div>
  );
}

export default function MediaGallery() {
  const { activeSilo } = useSilos();
  const [groups, setGroups] = useState<DateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'recentlyViewed' | 'recentlyAdded' | 'favorites'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [recentlyViewedItems, setRecentlyViewedItems] = useState<MediaItem[]>([]);
  const [recentlyAddedItems, setRecentlyAddedItems] = useState<MediaItem[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set([new Date().getFullYear()]));
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [gallerySort, setGallerySort] = useState<GallerySort>('date-newest');
  
  const mediaGridRef = useRef<HTMLDivElement>(null);

  // Helper function to sort items by gallery sort preference
  const sortItemsByGallerySort = (items: MediaItem[]): MediaItem[] => {
    const sorted = [...items];
    switch (gallerySort) {
      case 'date-newest':
        sorted.sort((a, b) => {
          if (!a.date_taken && !b.date_taken) return 0;
          if (!a.date_taken) return 1;
          if (!b.date_taken) return -1;
          return b.date_taken - a.date_taken;
        });
        break;
      case 'date-oldest':
        sorted.sort((a, b) => {
          if (!a.date_taken && !b.date_taken) return 0;
          if (!a.date_taken) return 1;
          if (!b.date_taken) return -1;
          return a.date_taken - b.date_taken;
        });
        break;
      case 'size-largest':
        sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
        break;
      case 'size-smallest':
        sorted.sort((a, b) => (a.size || 0) - (b.size || 0));
        break;
    }
    return sorted;
  };

  // Helper function to group items by year and month
  const groupByYearMonth = (items: MediaItem[]): YearGroup[] => {
    const yearMap = new Map<number, Map<number, MediaItem[]>>();
    
    // First sort items
    const sorted = sortItemsByGallerySort(items);
    
    // Group into years and months
    sorted.forEach((item) => {
      let year = new Date().getFullYear();
      let month = 0;
      
      if (item.date_taken) {
        const date = new Date(item.date_taken * 1000);
        year = date.getFullYear();
        month = date.getMonth();
      }
      
      if (!yearMap.has(year)) {
        yearMap.set(year, new Map());
      }
      
      const monthMap = yearMap.get(year)!;
      if (!monthMap.has(month)) {
        monthMap.set(month, []);
      }
      
      monthMap.get(month)!.push(item);
    });
    
    // Convert to YearGroup array, sorted by year descending
    const yearGroups: YearGroup[] = Array.from(yearMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, monthMap]) => ({
        year,
        months: Array.from(monthMap.entries())
          .sort((a, b) => b[0] - a[0]) // months descending
          .map(([monthIdx, monthItems]) => {
            const date = new Date(year, monthIdx, 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'long' });
            return {
              year,
              month: monthIdx,
              monthName,
              items: monthItems,
            };
          }),
      }));
    
    return yearGroups;
  };

  const {
    selectedIds: selectedMediaIds,
    isRectangleSelection: isSelecting,
    rectangleBounds: selectionRect,
    handleMouseDown: handleGridMouseDown,
    handleMouseMove: handleGridMouseMove,
    handleMouseUp: handleGridMouseUp,
    handleThumbnailClick,
    clearSelection,
  } = useFileSelection(mediaGridRef as React.RefObject<HTMLElement>);

  const { indexingComplete, selectedMediaId, setSelectedMediaId, favorites, isFavorite, addFavorite, removeFavorite, loadFavorites, theme, setShowSetupWizard, setIsCreatingFolder, currentFolderId, navigationHistory, navigationIndex, navigateBack, navigateForward, folders, removeMediaFromFolder, showGettingStartedTour, gettingStartedStep } =
    useAppStore();

  const isVideo = (type: string) => {
    return ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(type.toLowerCase());
  };

  const isTextFile = (type: string) => {
    return ['.txt', '.md', '.json', '.xml', '.csv', '.log', '.html', '.css', '.js', '.ts', '.py', '.sh', '.yml', '.yaml'].includes(type.toLowerCase());
  };

  const getFileIcon = (type: string, size: number = 80): string => {
    const bgColor = theme === 'dark' ? '#1f2937' : '#f3f4f6';
    
    let emoji = '📄';
    if (isVideo(type)) {
      emoji = '🎬';
    } else if (isTextFile(type)) {
      emoji = '📝';
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.tiff'].includes(type.toLowerCase())) {
      emoji = '🖼️';
    }
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
      <rect fill="${bgColor}" width="${size}" height="${size}"/>
      <text x="${size/2}" y="${size/2 + size/8}" text-anchor="middle" font-size="${size/2}" dominant-baseline="middle">${emoji}</text>
    </svg>`;
    
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  };

  const handleRotateThumbnail = async (itemId: number, direction: 'left' | 'right') => {
    let currentRotation = 0;
    groups.forEach(g => {
      g.items.forEach(item => {
        if (item.id === itemId) {
          currentRotation = item.rotation || 0;
        }
      });
    });
    
    const newRotation = direction === 'right' 
      ? (currentRotation + 90) % 360 
      : (currentRotation - 90 + 360) % 360;
    
    console.log(`[MediaGallery] Rotating item ${itemId} from ${currentRotation}° to ${newRotation}°`);
    
    setGroups(prevGroups =>
      prevGroups.map(g => ({
        ...g,
        items: g.items.map(item =>
          item.id === itemId ? { ...item, rotation: newRotation } : item
        )
      }))
    );
    
    try {
      console.log(`[MediaGallery] Sending POST to /api/media/${itemId}/rotate with rotation: ${newRotation}`);
      const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
      const res = await fetch(`/api/media/${itemId}/rotate${siloParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotation: newRotation })
      });
      
      console.log(`[MediaGallery] Rotation endpoint response: ${res.status}`);
      
      if (!res.ok) {
        const error = await res.text();
        console.error(`[MediaGallery] Failed to save rotation: ${res.status} ${error}`);
        setGroups(prevGroups =>
          prevGroups.map(g => ({
            ...g,
            items: g.items.map(item =>
              item.id === itemId ? { ...item, rotation: currentRotation } : item
            )
          }))
        );
      } else {
        console.log(`[MediaGallery] Rotation saved successfully for item ${itemId}`);
      }
    } catch (err) {
      console.error('[MediaGallery] Failed to save rotation:', err);
      setGroups(prevGroups =>
        prevGroups.map(g => ({
          ...g,
          items: g.items.map(item =>
            item.id === itemId ? { ...item, rotation: currentRotation } : item
          )
        }))
      );
    }
  };

  const handleToggleFavorite = (mediaId: number) => {
    if (isFavorite(mediaId)) {
      removeFavorite(mediaId);
    } else {
      addFavorite(mediaId);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMediaByDate(activeSilo?.name);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = data.map((g: any) => ({
        date_taken: g.date_taken,
        items: typeof g.items === 'string' ? JSON.parse(g.items || '[]') : (g.items || []),
      }));
      setGroups(parsed);
      console.log(`[MediaGallery] Loaded ${parsed.length} date groups, rotations now included in media items`);
    } catch (e) {
      const error = e as Error;
      const errorMsg = error?.message || 'Failed to load media';
      // Check if this is a backend unavailable error - if so, show helpful message
      if (errorMsg.includes('Backend unavailable') || errorMsg.includes('503')) {
        setError('Add a source in Settings to begin browsing');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMediaDragStart = async (e: React.DragEvent, item: MediaItem) => {
    const selectedIds = selectedMediaIds.has(item.id) 
      ? Array.from(selectedMediaIds) 
      : [item.id];
    
    console.log('[DEBUG] Starting drag with media IDs:', selectedIds);
    
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('application/json', JSON.stringify({
      type: 'media',
      mediaIds: selectedIds,
    }));
  };

  const handleDeleteSelected = async () => {
    if (selectedMediaIds.size === 0) return;

    setIsDeleting(true);
    try {
      const mediaIdsArray = Array.from(selectedMediaIds);
      
      if (currentFolderId) {
        console.log('[MediaGallery] Removing media from folder:', currentFolderId, 'Media IDs:', mediaIdsArray);
        await removeMediaFromFolder(currentFolderId, mediaIdsArray);
      } else {
        console.log('[MediaGallery] Hiding media from root:', mediaIdsArray);
        const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
        const response = await fetch(`/api/media/hide${siloParam}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mediaIds: mediaIdsArray }),
        });
        
        if (!response.ok) {
          throw new Error(`Failed to hide media: ${response.statusText}`);
        }
      }
      
      clearSelection();
      await load();
      
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('[MediaGallery] Failed to remove media:', err);
      setError(`Failed to remove media: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    loadFavorites();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (indexingComplete) {
      load();
    }
  }, [indexingComplete]);

  // Reload favorites when silo changes
  useEffect(() => {
    loadFavorites();
  }, [activeSilo?.name]);

  useEffect(() => {
    const loadRecents = async () => {
      const viewed = await getRecentlyViewed(50);
      const added = await getRecentlyAdded(50);

      const allItems = new Map<number, MediaItem>();
      const trackedIds = new Set<number>();
      groups.forEach((g) => {
        g.items.forEach((item) => {
          allItems.set(item.id, item);
          trackedIds.add(item.id);
        });
      });

      allItems.forEach((item, id) => {
        if (!viewed.some(v => v.id === id) && !added.some(a => a.id === id)) {
          trackFileAdded(id, item.path);
        }
      });

      const viewedItems = viewed
        .map((meta) => allItems.get(meta.id))
        .filter((item): item is MediaItem => !!item);

      const addedItems = added
        .map((meta) => allItems.get(meta.id))
        .filter((item): item is MediaItem => !!item);

      setRecentlyViewedItems(viewedItems);
      setRecentlyAddedItems(addedItems);
    };

    if (groups.length > 0) {
      loadRecents();
    }
  }, [groups]);



  const getDisplayGroups = () => {
    const filteredGroups = groups.map(g => ({
      ...g,
      items: currentFolderId 
        ? g.items.filter(item => {
            const currentFolder = folders[currentFolderId];
            return currentFolder && currentFolder.mediaIds.includes(item.id);
          })
        : g.items
    })).filter(g => g.items.length > 0);

    if (activeTab === 'favorites') {
      const favoriteItems: MediaItem[] = [];
      filteredGroups.forEach((g) => {
        g.items.forEach((item) => {
          if (isFavorite(item.id)) {
            favoriteItems.push(item);
          }
        });
      });
      return [{ date_taken: null, items: favoriteItems }];
    }

    if (activeTab === 'recentlyViewed') {
      return [{ date_taken: null, items: recentlyViewedItems }];
    }

    if (activeTab === 'recentlyAdded') {
      return [{ date_taken: null, items: recentlyAddedItems }];
    }

    return filteredGroups;
  };

  const sortItems = (items: MediaItem[]): MediaItem[] => {
    const sorted = [...items];
    sorted.sort((a, b) => {
      let compareVal = 0;
      switch (sortField) {
        case 'date':
          compareVal = (a.date_taken || 0) - (b.date_taken || 0);
          break;
        case 'name':
          compareVal = (a.path.split('/').pop() || '').localeCompare(b.path.split('/').pop() || '');
          break;
        case 'size':
          compareVal = (a.size || 0) - (b.size || 0);
          break;
        case 'type':
          compareVal = (a.type || '').localeCompare(b.type || '');
          break;
      }
      return sortOrder === 'asc' ? compareVal : -compareVal;
    });
    return sorted;
  };

  const groupByDate = (items: MediaItem[]): DateGroup[] => {
    const grouped: Record<string, MediaItem[]> = {};
    items.forEach((item) => {
      const dateKey = item.date_taken ? new Date(item.date_taken * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }) : 'Unknown Date';
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(item);
    });
    
    return Object.entries(grouped).map(([dateStr, items]) => ({
      date_taken: dateStr === 'Unknown Date' ? null : new Date(dateStr).getTime() / 1000,
      items: sortItems(items),
    })).sort((a, b) => (b.date_taken || 0) - (a.date_taken || 0));
  };

  const displayGroups = (() => {
    const groups = getDisplayGroups();
    if (viewMode === 'list') {
      const allItems: MediaItem[] = [];
      groups.forEach(g => allItems.push(...g.items));
      return [{ date_taken: null, items: sortItems(allItems) }];
    }
    const allItems: MediaItem[] = [];
    groups.forEach(g => allItems.push(...g.items));
    return groupByDate(allItems);
  })();

  const bgClass = theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50';
  const textClass = theme === 'dark' ? 'text-white' : 'text-gray-900';
  const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';

  if (error) {
    return (
      <div className={`w-full h-full overflow-auto p-6 ${bgClass}`}>
        <div className={`text-center py-12 rounded-lg border ${borderClass}`}>
          <p className={`${textClass}`}>Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full overflow-auto ${bgClass}`}>
      {/* Sticky Header */}
      <div className={`sticky top-0 z-10 ${bgClass} border-b ${borderClass} p-6`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={navigateBack}
              disabled={navigationIndex <= 0}
              className={`px-3 py-2 rounded font-medium text-sm transition ${
                navigationIndex <= 0
                  ? theme === 'dark'
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : theme === 'dark'
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-900'
              }`}
              title="Go back"
            >
              ←
            </button>
            <button
              onClick={navigateForward}
              disabled={navigationIndex >= navigationHistory.length - 1}
              className={`px-3 py-2 rounded font-medium text-sm transition ${
                navigationIndex >= navigationHistory.length - 1
                  ? theme === 'dark'
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : theme === 'dark'
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-900'
              }`}
              title="Go forward"
            >
              →
            </button>
          </div>

          <h2 className={`text-2xl font-bold ${textClass}`}>gallery</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setIsCreatingFolder(true)}
              className={`px-4 py-2 rounded font-medium text-sm transition ${
                currentFolderId
                  ? 'bg-orange-800 hover:bg-orange-900 text-white'
                  : 'bg-orange-800 hover:bg-orange-900 text-white'
              }`}
              title={currentFolderId ? "create a new subfolder" : "create a new folder"}
            >
              {currentFolderId ? 'new subfolder' : 'new folder'}
            </button>
            <button
              onClick={() => setShowSetupWizard(true)}
              className={`px-4 py-2 rounded font-medium text-sm transition ${
                theme === 'dark'
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              } ${
                showGettingStartedTour && gettingStartedStep === 1
                  ? 'animate-pulse ring-4 ring-orange-400 ring-opacity-75 shadow-xl shadow-orange-400/50'
                  : ''
              }`}
              title="Add another source directory"
            >
              ➕ source
            </button>
            <button
              onClick={load}
              disabled={loading}
              className={`px-4 py-2 rounded font-medium text-sm transition ${
                loading
                  ? 'opacity-50 cursor-not-allowed'
                  : theme === 'dark'
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              }`}
            >
              {loading ? 'loading...' : 'refresh'}
            </button>
          </div>
        </div>

        {/* Tabs and View Controls */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {(['all', 'recentlyViewed', 'recentlyAdded', 'favorites'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === tab
                    ? theme === 'dark'
                      ? 'bg-orange-600 text-white'
                      : 'bg-orange-100 text-orange-700'
                    : theme === 'dark'
                      ? 'text-gray-400 hover:bg-gray-800'
                      : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab === 'all' && '📁 all'}
                {tab === 'recentlyViewed' && 'recently viewed'}
                {tab === 'recentlyAdded' && 'recently added'}
                {tab === 'favorites' && `favorites (${favorites.size})`}
              </button>
            ))}
          </div>

          {/* View Mode and Sort Controls */}
          <div className="flex gap-2 items-center">
            {/* View Mode Toggle */}
            <div className="flex gap-1 border rounded-lg p-1" style={{
              borderColor: theme === 'dark' ? '#4b5563' : '#d1d5db'
            }}>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 rounded text-sm font-medium transition ${
                  viewMode === 'grid'
                    ? theme === 'dark'
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-200 text-gray-900'
                    : theme === 'dark'
                      ? 'text-gray-400 hover:text-white'
                      : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Grid view"
              >
                ⊞
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 rounded text-sm font-medium transition ${
                  viewMode === 'list'
                    ? theme === 'dark'
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-200 text-gray-900'
                    : theme === 'dark'
                      ? 'text-gray-400 hover:text-white'
                      : 'text-gray-600 hover:text-gray-900'
                }`}
                title="List view"
              >
                ☰
              </button>
            </div>

            {/* Gallery Sort - Show in grid view */}
            {viewMode === 'grid' && (
              <div className="flex gap-2">
                <select
                  value={gallerySort}
                  onChange={(e) => setGallerySort(e.target.value as GallerySort)}
                  className={`px-3 py-1 rounded text-sm border transition ${
                    theme === 'dark'
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  title="Sort gallery items"
                >
                  <option value="date-newest">newest first</option>
                  <option value="date-oldest">oldest first</option>
                  <option value="size-largest">largest first</option>
                  <option value="size-smallest">smallest first</option>
                </select>
                
                {/* Year Filter */}
                {(() => {
                  const allItems: MediaItem[] = [];
                  displayGroups.forEach(g => allItems.push(...g.items));
                  const yearGroups = groupByYearMonth(allItems);
                  const years = yearGroups.map(yg => yg.year).sort((a, b) => b - a);
                  
                  return (
                    <select
                      value={selectedYear || ''}
                      onChange={(e) => setSelectedYear(e.target.value ? parseInt(e.target.value) : null)}
                      className={`px-3 py-1 rounded text-sm border transition ${
                        theme === 'dark'
                          ? 'bg-gray-700 border-gray-600 text-white'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                      title="Filter by year"
                    >
                      <option value="">all years</option>
                      {years.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  );
                })()}
              </div>
            )}

            {/* List Sort Controls - Only show in list view */}
            {viewMode === 'list' && (
              <div className="flex gap-2">
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className={`px-3 py-1 rounded text-sm border transition ${
                    theme === 'dark'
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="date">date</option>
                  <option value="name">name</option>
                  <option value="size">size</option>
                  <option value="type">type</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className={`px-2 py-1 rounded text-sm font-medium transition border ${
                    theme === 'dark'
                      ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                  title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            )}

            {/* Delete button - show in both root and folders */}
            {selectedMediaIds.size > 0 && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className={`px-3 py-1 rounded text-sm font-medium transition text-red-400 hover:bg-red-900 hover:text-red-200 ${
                  theme === 'dark' ? '' : 'text-red-600 hover:bg-red-100'
                }`}
                title="remove selected photos"
              >
                🗑️
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div 
        className="p-6 overflow-auto flex-1"
        ref={mediaGridRef}
        onMouseDown={handleGridMouseDown}
        onMouseMove={handleGridMouseMove}
        onMouseUp={handleGridMouseUp}
      >
        {/* Folder Grid */}
        <FolderGrid />

        {!indexingComplete && (
          <div className={`mb-6 p-4 rounded-lg border ${
            theme === 'dark'
              ? 'bg-amber-900 bg-opacity-30 border-amber-700'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-amber-300' : 'text-amber-900'}`}>
              ⚠️ indexing in progress...
            </p>
            <p className={`text-xs ${theme === 'dark' ? 'text-amber-200' : 'text-amber-800'} mt-1`}>
              files may not be searchable until indexing completes. you can browse and view files now.
            </p>
          </div>
        )}
        {displayGroups.length === 0 ? (
          <div className={`text-center py-12 rounded-lg border ${borderClass}`}>
            <p className={`${textClass}`}>no media indexed</p>
            {activeTab === 'favorites' && (
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-2`}>
                click the ❤️ icon on photos to add them to favorites
              </p>
            )}
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <div 
                className="space-y-12"
              >
                {(() => {
                  // Get all items for display
                  const allItems: MediaItem[] = [];
                  displayGroups.forEach(g => allItems.push(...g.items));
                  
                  // Group by year and month
                  const yearMonthGroups = groupByYearMonth(allItems);
                  
                  // Filter by selected year if one is chosen
                  const filteredYearGroups = selectedYear 
                    ? yearMonthGroups.filter(yg => yg.year === selectedYear)
                    : yearMonthGroups;
                  
                  return filteredYearGroups.map((yearGroup) => (
                    <div key={yearGroup.year}>
                      {/* Year Header with Expand/Collapse */}
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedYears);
                          const yearIndex = filteredYearGroups.findIndex(yg => yg.year === yearGroup.year);
                          
                          if (newExpanded.has(yearGroup.year)) {
                            // Collapsing this year - auto-expand previous year if it exists
                            newExpanded.delete(yearGroup.year);
                            if (yearIndex > 0 && filteredYearGroups[yearIndex - 1]) {
                              newExpanded.add(filteredYearGroups[yearIndex - 1].year);
                            }
                          } else {
                            newExpanded.add(yearGroup.year);
                          }
                          setExpandedYears(newExpanded);
                        }}
                        className={`flex items-center gap-2 mb-6 p-3 rounded-lg transition ${
                          theme === 'dark'
                            ? 'bg-gray-800 hover:bg-gray-700 text-white'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                        }`}
                      >
                        <span className="text-lg">
                          {expandedYears.has(yearGroup.year) ? '▼' : '▶'}
                        </span>
                        <h2 className="text-xl font-bold">
                          {yearGroup.year}
                        </h2>
                        <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                          ({yearGroup.months.reduce((sum, m) => sum + m.items.length, 0)} items)
                        </span>
                      </button>
                      
                      {/* Year Content */}
                      {expandedYears.has(yearGroup.year) && (
                        <div className="space-y-8 mb-8">
                          {yearGroup.months.map((monthGroup) => (
                            <div key={`${monthGroup.year}-${monthGroup.month}`}>
                              {/* Month Header */}
                              <h3 className={`text-sm font-bold mb-4 px-3 py-2 pl-3 rounded-md border-l-4 border-orange-500 ${
                                theme === 'dark' 
                                  ? 'bg-gray-800 text-orange-300' 
                                  : 'bg-orange-50 text-orange-900'
                              }`}>
                                {monthGroup.monthName} <span className={`font-normal text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-orange-700'}`}>({monthGroup.items.length} items)</span>
                              </h3>
                              
                              {/* Month Grid */}
                              <div
                                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 relative"
                                data-drag-container="media-gallery"
                                onDragOver={(e) => {
                                  const data = e.dataTransfer?.getData('text/plain');
                                  if (data && data.startsWith('folder_')) {
                                    e.preventDefault();
                                    e.dataTransfer!.dropEffect = 'move';
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  
                                  try {
                                    const mediaData = e.dataTransfer?.getData('application/json');
                                    if (mediaData) {
                                      const data = JSON.parse(mediaData);
                                      if (data.type === 'media' && data.mediaIds) {
                                        console.log('[MediaGallery] Media dropped on grid - creating new folder with selection');
                                        setIsCreatingFolder(true);
                                      }
                                    }
                                  } catch (err) {
                                    console.error('[MediaGallery] Error parsing media drop data:', err);
                                  }

                                  const folderIdStr = e.dataTransfer?.getData('text/plain');
                                  if (folderIdStr && folderIdStr.startsWith('folder_')) {
                                    e.preventDefault();
                                    const folderId = parseInt(folderIdStr.replace('folder_', ''));
                                    console.log('[MediaGallery] Adding selected media to folder:', folderId, 'Selected:', Array.from(selectedMediaIds));
                                    
                                    if (selectedMediaIds.size > 0) {
                                      (async () => {
                                        try {
                                          const mediaIdsArray = Array.from(selectedMediaIds);
                                          const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
                                          const response = await fetch(`/api/folders/${folderId}/add-media${siloParam}`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ mediaIds: mediaIdsArray }),
                                          });
                                          
                                          if (!response.ok) {
                                            const errorData = await response.json().catch(() => ({}));
                                            throw new Error(errorData.detail || `Failed to add media to folder: ${response.statusText}`);
                                          }
                                          
                                          console.log('[MediaGallery] Successfully added', mediaIdsArray.length, 'items to folder', folderId);
                                          clearSelection();
                                          await load();
                                        } catch (err) {
                                          console.error('[MediaGallery] Failed to add media to folder:', err);
                                          setError(`Failed to add media to folder: ${err instanceof Error ? err.message : 'Unknown error'}`);
                                        }
                                      })();
                                    }
                                  }
                                }}
                              >
                                {monthGroup.items.map((item) => {
                                  const isSelected = selectedMediaIds.has(item.id);
                                  return (
                                  <div
                                    key={item.id}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      trackFileViewed(item.id, item.path);
                                      setSelectedMediaId(item.id);
                                    }}
                                  >
                                    <LazyMediaItem
                                      item={item}
                                      isSelected={isSelected}
                                      handleThumbnailClick={handleThumbnailClick}
                                      handleMediaDragStart={handleMediaDragStart}
                                      getFileIcon={getFileIcon}
                                      isVideo={isVideo}
                                      isFavorite={isFavorite}
                                      theme={theme}
                                      activeSilo={activeSilo}
                                    />
                                  </div>
                                  );
                                })}
                                {/* Selection Rectangle */}
                                <SelectionRectangle
                                  isActive={isSelecting}
                                  bounds={selectionRect}
                                  itemCount={selectedMediaIds.size}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className={`w-full border-collapse text-sm ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                  <thead>
                    <tr className={`border-b ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-100'}`}>
                      <th className="px-4 py-3 text-left font-semibold w-1/2">
                        <button
                          onClick={() => {
                            if (sortField === 'name') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('name');
                              setSortOrder('asc');
                            }
                          }}
                          className="flex items-center gap-1 hover:text-orange-500 transition"
                        >
                          Filename
                          {sortField === 'name' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left font-semibold w-1/6">
                        <button
                          onClick={() => {
                            if (sortField === 'date') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('date');
                              setSortOrder('desc');
                            }
                          }}
                          className="flex items-center gap-1 hover:text-orange-500 transition"
                        >
                          Date Modified
                          {sortField === 'date' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left font-semibold w-1/6">
                        <button
                          onClick={() => {
                            if (sortField === 'size') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('size');
                              setSortOrder('desc');
                            }
                          }}
                          className="flex items-center gap-1 hover:text-orange-500 transition"
                        >
                          Size
                          {sortField === 'size' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left font-semibold w-1/6">
                        <button
                          onClick={() => {
                            if (sortField === 'type') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('type');
                              setSortOrder('asc');
                            }
                          }}
                          className="flex items-center gap-1 hover:text-orange-500 transition"
                        >
                          Type
                          {sortField === 'type' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center font-semibold">Favorite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayGroups[0]?.items.map((item) => (
                      <tr
                        key={item.id}
                        onClick={(e) => handleThumbnailClick(item.id, e)}
                        onDoubleClick={() => {
                          trackFileViewed(item.id, item.path);
                          setSelectedMediaId(item.id);
                        }}
                        className={`border-b cursor-pointer transition hover:bg-opacity-50 ${
                          theme === 'dark'
                            ? 'border-gray-700 hover:bg-gray-800'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-3 flex items-center gap-3 min-w-0">
                          {/* Thumbnail */}
                          <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-300">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/media/thumbnail/${item.id}?size=60&square=true&rotation=${item.rotation || 0}${activeSilo?.name ? `&silo_name=${encodeURIComponent(activeSilo.name)}` : ''}`}
                              alt="Thumbnail"
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                              onError={(e) => {
                                e.currentTarget.src = getFileIcon(item.type, 40);
                              }}
                            />
                          </div>
                          {/* Filename - truncate long names */}
                          <span className="truncate">{item.path.split('/').pop()}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                          {item.date_taken
                            ? new Date(item.date_taken * 1000).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                          {item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                          {item.type ? item.type.toUpperCase() : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(item.id);
                            }}
                            className="transition-all duration-200 hover:scale-125 flex items-center justify-center"
                            style={{
                              opacity: isFavorite(item.id) ? 0.9 : 0.4,
                              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                              cursor: 'pointer',
                              width: '24px',
                              height: '24px',
                            }}
                            title={isFavorite(item.id) ? 'Remove favorite' : 'Add to favorites'}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorite(item.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" style={{ color: isFavorite(item.id) ? '#f59e0b' : '#9ca3af' }}>
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Photo Modal */}
      {selectedMediaId !== null && (
        <BasePhotoModal
          isOpen={selectedMediaId !== null}
          media={selectedMediaId !== null ? (() => {
            let mediaItem: MediaItem | undefined;
            for (const group of groups) {
              mediaItem = group.items.find(item => item.id === selectedMediaId);
              if (mediaItem) break;
            }
            return {
              id: selectedMediaId.toString(),
              image_path: mediaItem?.path || '',
              thumbnail: '',
              name: mediaItem?.path?.split('/').pop() || '',
              rotation: mediaItem?.rotation || 0
            };
          })() : null}
          onClose={() => setSelectedMediaId(null)}
          onRotate={(mediaId, newRotation) => {
            const numMediaId = parseInt(mediaId);
            setGroups(prevGroups =>
              prevGroups.map(g => ({
                ...g,
                items: g.items.map(item =>
                  item.id === numMediaId ? { ...item, rotation: newRotation } : item
                )
              }))
            );
          }}
          onToggleFavorite={handleToggleFavorite}
          isFavorite={isFavorite}
          theme={theme}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className={`rounded-lg p-8 max-w-md w-full mx-4 ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}
            >
              {currentFolderId ? 'Remove from Folder?' : 'Hide Photos?'}
            </h2>

            <p
              className={`mb-4 ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              {currentFolderId
                ? `You are about to remove ${selectedMediaIds.size} photo${selectedMediaIds.size !== 1 ? 's' : ''} from this folder.`
                : `You are about to hide ${selectedMediaIds.size} photo${selectedMediaIds.size !== 1 ? 's' : ''} from the library.`}
            </p>

            <p
              className={`mb-6 text-sm font-medium ${
                theme === 'dark' ? 'text-orange-300' : 'text-orange-700'
              } bg-opacity-20 p-3 rounded ${
                theme === 'dark' ? 'bg-orange-900' : 'bg-orange-100'
              }`}
            >
              ℹ️ The original files will <strong>not</strong> be deleted - only {currentFolderId ? 'removed from this folder' : 'hidden from the library'}.
            </p>

            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  theme === 'dark'
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className={`px-4 py-2 rounded-lg font-medium text-white transition ${
                  theme === 'dark'
                    ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400'
                    : 'bg-red-500 hover:bg-red-600 disabled:bg-red-400'
                }`}
              >
                {isDeleting ? (currentFolderId ? 'Removing...' : 'Hiding...') : (currentFolderId ? 'Remove from Folder' : 'Hide Photos')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
