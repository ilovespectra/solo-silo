'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSilos } from '@/hooks/useSilos';
import { DirectoryNode, FileMetadata } from '@/types';
import { formatDate, getFileSize } from '@/lib/utils';
import BrowsePhotoModal from '@/components/PhotoModal/BrowsePhotoModal';
import FolderGrid from '@/components/FileBrowser/FolderGrid';
import CreateFolderModal from '@/components/FileBrowser/CreateFolderModal';
import { useDragSelection } from '@/hooks/useDragSelection';
import { useDragSession, DragItem } from '@/hooks/useDragSession';
import SelectionRectangle from '@/components/SelectionRectangle/SelectionRectangle';
import { AddToFolderContextMenu } from '@/components/Search/components';

interface FileBrowserProps {
  initialPath?: string;
}

interface MediaItem extends FileMetadata {
  id: number;
  date_taken?: number;
  rotation?: number;
}

type ViewMode = 'list' | 'columns' | 'grid' | 'gallery';
type ThumbnailSize = 'small' | 'medium' | 'large';
type SortColumn = 'name' | 'size' | 'modified' | 'created' | 'type';
type SortOrder = 'asc' | 'desc';

interface SortHeaderProps {
  label: string;
  column: SortColumn;
  currentColumn: SortColumn;
  currentOrder: SortOrder;
  onSort: (column: SortColumn) => void;
  className?: string;
}

function SortHeader({
  label,
  column,
  currentColumn,
  currentOrder,
  onSort,
  className = '',
}: SortHeaderProps) {
  const isActive = currentColumn === column;
  return (
    <button
      onClick={() => onSort(column)}
      className={`flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition ${className}`}
    >
      {label}
      {isActive && (
        <span className="text-sm">
          {currentOrder === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </button>
  );
}

export default function FileBrowser({ initialPath = '/' }: FileBrowserProps) {
  const { 
    config, 
    theme, 
    folders, 
    addMediaToFolder,
    currentFolderId,
    navigationHistory,
    navigationIndex,
    navigateBack,
    navigateForward
  } = useAppStore();
  const { activeSilo } = useSilos();
  
  console.log('[FileBrowser] Render with currentFolderId:', currentFolderId);

  const getFileTypeIcon = (type: string): string => {
    const bgColor = theme === 'dark' ? '374151' : 'e5e7eb';
    const textColor = theme === 'dark' ? '9ca3af' : '6b7280';
    
    let emoji = '📄';
    if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(type.toLowerCase())) {
      emoji = '🎬';
    } else if (['.txt', '.md', '.json', '.xml', '.csv', '.log', '.html', '.css', '.js', '.ts', '.py', '.sh', '.yml', '.yaml'].includes(type.toLowerCase())) {
      emoji = '📝';
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.tiff'].includes(type.toLowerCase())) {
      emoji = '🖼️';
    }
    
    return `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23${bgColor}" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%23${textColor}" font-size="40"%3E${encodeURIComponent(emoji)}%3C/text%3E%3C/svg%3E`;
  };
  
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [fileNavigationHistory, setFileNavigationHistory] = useState<string[]>([initialPath]);
  const [fileNavigationIndex, setFileNavigationIndex] = useState(0);
  const [contents, setContents] = useState<DirectoryNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>('medium');
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [selectedMediaId, setSelectedMediaId] = useState<number | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<number>>(new Set());
  const [moveToFolderMenuPos, setMoveToFolderMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const mediaGridRef = useRef<HTMLDivElement>(null);

  const mouseDownMediaItemRef = useRef<MediaItem | null>(null);
  const isDraggingRef = useRef(false);
  
  const { isSelecting, selectionRect, selectedItems, handleMouseDown } = useDragSelection(
    mediaGridRef as React.RefObject<HTMLElement>,
    (items) => {
      console.log('[DEBUG] Drag selection changed:', items);
      const mediaIds = new Set(
        items
          .map(id => {
            const mediaItem = mediaItems.find(m => m.id.toString() === id);
            console.log('[DEBUG] Looking up item:', id, '-> found:', mediaItem?.id);
            return mediaItem?.id;
          })
          .filter((id): id is number => id !== undefined)
      );
      console.log('[DEBUG] Updated selectedMediaIds:', Array.from(mediaIds));
      setSelectedMediaIds(mediaIds);
    }
  );

  const {
    dragSession,
    isDragging,
    startDragSession,
    updateDragPosition,
    clearDropTargetHighlight,
    endDragSession,
  } = useDragSession();

  interface FolderDropTarget {
    id: string;
    name: string;
    folderId: string;
    element: HTMLElement | null;
    path: string;
    canAccept: (items: DragItem[]) => boolean;
  }

  const dropTargets: FolderDropTarget[] = Object.entries(folders)
    .map(([folderId, folder]) => ({
      id: `folder-${folderId}`,
      name: folder.name,
      folderId,
      element: document.querySelector(`[data-folder-id="${folderId}"]`) as HTMLElement | null,
      path: folder.name,
      canAccept: (items: DragItem[]) => {
        return items.length > 0 && items.every(item => item.type === 'file');
      },
    }))
    .filter(t => t.element !== null);


  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const fsResponse = await fetch(`/api/files/browse?path=${encodeURIComponent(path)}`, {
        headers: {
          'x-permissions': JSON.stringify(config.permissions),
        },
      });

      if (!fsResponse.ok) {
        throw new Error(`Failed to load directory: ${fsResponse.statusText}`);
      }

      const fsData = await fsResponse.json();
      setContents(fsData);
      setLoading(false);
      
      setLoadingThumbnails(true);
      let mediaLoaded = false;
      
      try {
        const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
        const mediaResponse = await fetch(`/api/media/by-date${siloParam}`);
        if (mediaResponse.ok) {
          const mediaByDate = await mediaResponse.json();
          
          const allMedia: MediaItem[] = [];
          Object.values(mediaByDate).forEach((dateGroup: unknown) => {
            if (Array.isArray(dateGroup)) {
              allMedia.push(...dateGroup);
            }
          });

          const mediaInCurrentPath = allMedia.filter((item) => {
            if (!item.path) return false;
            const itemDir = item.path.substring(0, item.path.lastIndexOf('/'));
            return itemDir === path;
          });

          console.log(`Found ${mediaInCurrentPath.length} media items in path ${path}`);
          
          if (mediaInCurrentPath.length > 0) {
            const sorted = sortMediaItems(mediaInCurrentPath, sortColumn, sortOrder);
            setMediaItems(sorted);
            mediaLoaded = true;
          }
        }
      } catch (mediaErr) {
        console.log('Media fetch failed, falling back to file system:', mediaErr);
      }

      if (!mediaLoaded && fsData.children) {
        const mediaFiles = (fsData.children as (DirectoryNode | FileMetadata)[])
          .filter((item) => !('children' in item) && isMediaFile((item as FileMetadata).type))
          .map((item, index) => ({
            id: index,
            ...(item as FileMetadata),
          }));
        
        console.log(`Fallback: Found ${mediaFiles.length} media files from file system`);
        const sorted = sortMediaItems(mediaFiles, sortColumn, sortOrder);
        setMediaItems(sorted);
      }
      
      setLoadingThumbnails(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
      setLoadingThumbnails(false);
    }
  }, [config.permissions, sortColumn, sortOrder]);

  const sortMediaItems = (items: MediaItem[], column: SortColumn, order: SortOrder): MediaItem[] => {
    const sorted = [...items].sort((a, b) => {
      let aVal: string | number | undefined;
      let bVal: string | number | undefined;

      if (column === 'modified') {
        aVal = (a.modified ?? a.date_taken ?? a.created ?? 0);
        bVal = (b.modified ?? b.date_taken ?? b.created ?? 0);
      } else if (column === 'created') {
        aVal = (a.created ?? a.date_taken ?? 0);
        bVal = (b.created ?? b.date_taken ?? 0);
      } else if (column === 'name') {
        aVal = (a.name || a.path?.split('/').pop() || '').toLowerCase();
        bVal = (b.name || b.path?.split('/').pop() || '').toLowerCase();
      } else if (column === 'type') {
        aVal = String(a[column as keyof MediaItem] || '').toLowerCase();
        bVal = String(b[column as keyof MediaItem] || '').toLowerCase();
      } else {
        const aFieldVal = a[column as keyof MediaItem];
        const bFieldVal = b[column as keyof MediaItem];
        aVal = typeof aFieldVal === 'string' || typeof aFieldVal === 'number' ? aFieldVal : String(aFieldVal || '');
        bVal = typeof bFieldVal === 'string' || typeof bFieldVal === 'number' ? bFieldVal : String(bFieldVal || '');
      }

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortOrder('asc');
    }
  };

  const handleGridClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const isClickingOnItem = (target: EventTarget): boolean => {
        const element = target as HTMLElement;
        let current: HTMLElement | null = element;
        while (current && current !== e.currentTarget) {
          if (current.getAttribute('data-item-id')) {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      };

      if (!isClickingOnItem(e.target)) {
        setSelectedMediaIds(new Set());
      }
    },
    []
  );

  const handleMediaMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, mediaItem: MediaItem) => {
      if (e.button !== 0) return;
      
      mouseDownMediaItemRef.current = mediaItem;
      console.log('[DEBUG] Mouse down on item:', mediaItem.id);
    },
    []
  );

  const handleFolderMediaDrop = useCallback(
    async (folderId: string, mediaIds: number[]) => {
      try {
        await addMediaToFolder(folderId, mediaIds);
        console.log(`[FileBrowser] Successfully added ${mediaIds.length} items to folder`);
      } catch (error) {
        console.error('[FileBrowser] Failed to add media to folder:', error);
        throw error;
      }
    },
    [addMediaToFolder]
  );

  const toggleMediaSelection = (mediaId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }
    
    const newSelection = new Set(selectedMediaIds);
    
    if (event.ctrlKey || event.metaKey) {
      if (newSelection.has(mediaId)) {
        newSelection.delete(mediaId);
      } else {
        newSelection.add(mediaId);
      }
    } else if (event.shiftKey) {
      const selectedArray = Array.from(newSelection);
      const lastSelected = selectedArray[selectedArray.length - 1];
      if (lastSelected !== undefined) {
        const firstIndex = mediaItems.findIndex(m => m.id === lastSelected);
        const secondIndex = mediaItems.findIndex(m => m.id === mediaId);
        const start = Math.min(firstIndex, secondIndex);
        const end = Math.max(firstIndex, secondIndex);
        for (let i = start; i <= end; i++) {
          newSelection.add(mediaItems[i].id);
        }
      } else {
        newSelection.add(mediaId);
      }
    } else {
      newSelection.clear();
      newSelection.add(mediaId);
    }
    setSelectedMediaIds(newSelection);
  };

  useEffect(() => {
    const mediaItem = mouseDownMediaItemRef.current;
    if (!mediaItem) return;

    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!(e.buttons & 1)) return;
      
      const dragItems: DragItem[] = [];
      let itemsToSelect: number[] = [];
      if (selectedMediaIds.has(mediaItem.id)) {
        itemsToSelect = Array.from(selectedMediaIds);
      } else {
        itemsToSelect = [mediaItem.id];
      }

      for (const id of itemsToSelect) {
        const item = mediaItems.find(m => m.id === id);
        if (item) {
          dragItems.push({
            id: `media-${item.id}`,
            name: item.name,
            type: 'file' as const,
            path: item.path,
            size: item.size,
            thumbnailUrl: `http://127.0.0.1:8000/api/media/thumbnail/${item.id}?size=300`,
          });
        }
      }

      if (!isDragging && dragItems.length > 0) {
        isDraggingRef.current = true;
        const mediaGridContainer = document.querySelector('[data-drag-container="media-grid"]');
        if (mediaGridContainer) {
          startDragSession(dragItems, mediaGridContainer as HTMLElement, 'move');
        }
      }
      
      if (isDragging) {
        updateDragPosition(e.clientX, e.clientY);
      }
    };

    const handleDocumentMouseUp = async (e: MouseEvent) => {
      mouseDownMediaItemRef.current = null;
      
      if (!isDragging || !dragSession) {
        endDragSession();
        isDraggingRef.current = false;
        return;
      }

      const availableTargets = dropTargets.filter(t => t.element);
      
      let droppedTarget: typeof dropTargets[0] | null = null;
      for (const target of availableTargets) {
        if (target.element) {
          const rect = target.element.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right && 
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            droppedTarget = target;
            break;
          }
        }
      }

      if (droppedTarget && droppedTarget.canAccept(dragSession.items)) {
        const mediaIds = dragSession.items
          .map(item => parseInt(item.id.replace('media-', '')))
          .filter(id => !isNaN(id));

        try {
          await addMediaToFolder(droppedTarget.folderId, mediaIds);
          console.log(`Added ${mediaIds.length} items to folder "${droppedTarget.name}"`);
          setSelectedMediaIds(new Set());
        } catch (error) {
          console.error('Failed to add media to folder:', error);
        }
      }

      if (droppedTarget && droppedTarget.element) {
        clearDropTargetHighlight({
          id: droppedTarget.id,
          name: droppedTarget.name,
          element: droppedTarget.element,
          path: droppedTarget.path,
          canAccept: droppedTarget.canAccept,
        });
      }
      endDragSession();
      isDraggingRef.current = false;
    };

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [mouseDownMediaItemRef, selectedMediaIds, isDragging, dragSession, dropTargets, mediaItems, addMediaToFolder, clearDropTargetHighlight, endDragSession, startDragSession, updateDragPosition]);

  useEffect(() => {
    void loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  useEffect(() => {
    const sorted = sortMediaItems(mediaItems, sortColumn, sortOrder);
    setMediaItems(sorted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortColumn, sortOrder]);

  useEffect(() => {
    if (mediaItems.length > 0) {
      console.log('MediaItems loaded:', mediaItems.length);
      console.log('First item:', mediaItems[0]);
      console.log('Item IDs:', mediaItems.slice(0, 3).map(i => ({ id: i.id, name: i.name, path: i.path })));
    }
  }, [mediaItems]);

  const isMediaFile = (type: string): boolean => {
    const imageExts = ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp'];
    const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    const allMediaExts = [...imageExts, ...videoExts];
    return allMediaExts.includes(type.toLowerCase());
  };

  const toggleFileSelection = (path: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedFiles(newSelected);
  };

  const handleNavigate = (path: string) => {
    const newHistory = fileNavigationHistory.slice(0, fileNavigationIndex + 1);
    newHistory.push(path);
    console.log('Navigate to:', path, 'History:', newHistory, 'Index:', newHistory.length - 1);
    setFileNavigationHistory(newHistory);
    setFileNavigationIndex(newHistory.length - 1);
    setCurrentPath(path);
  };

  const handleNavigateBack = async () => {
    if (currentFolderId) {
      console.log('Navigate back from folder:', currentFolderId, 'Index:', navigationIndex);
      await navigateBack();
    } else if (fileNavigationIndex > 0) {
      const newIndex = fileNavigationIndex - 1;
      console.log('Navigate back in file system:', newIndex, '/', fileNavigationHistory[newIndex]);
      setFileNavigationIndex(newIndex);
      setCurrentPath(fileNavigationHistory[newIndex]);
    }
  };

  const handleNavigateForward = async () => {
    if (currentFolderId) {
      await navigateForward();
    } else if (fileNavigationIndex < fileNavigationHistory.length - 1) {
      const newIndex = fileNavigationIndex + 1;
      setFileNavigationIndex(newIndex);
      setCurrentPath(fileNavigationHistory[newIndex]);
    }
  };

  const handleRotate = (mediaId: string, newRotation: number) => {
    const numMediaId = parseInt(mediaId);
    setMediaItems(prevItems =>
      prevItems.map(item =>
        item.id === numMediaId ? { ...item, rotation: newRotation } : item
      )
    );
  };

  if (!config.permissions.listDirectories) {
    return (
      <div className="p-8 text-center">
        <div className={`rounded-lg p-6 border ${theme === 'dark' ? 'bg-yellow-900 bg-opacity-20 border-yellow-700' : 'bg-yellow-50 border-yellow-200'}`}>
          <h3 className={`font-semibold mb-2 ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-900'}`}>Permission Required</h3>
          <p className={theme === 'dark' ? 'text-yellow-200' : 'text-yellow-700'}>
            Grant permission to list directories in the setup wizard to browse files.
          </p>
        </div>
      </div>
    );
  }

  const bgClass = theme === 'dark' ? 'bg-gray-900' : 'bg-white';
  const textClass = theme === 'dark' ? 'text-white' : 'text-gray-900';
  const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
  const hoverClass = theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50';

  const getGridClasses = () => {
    if (viewMode === 'list') return 'space-y-1';
    
    switch (viewMode) {
      case 'columns':
        return 'grid grid-cols-2 gap-3';
      case 'grid':
        switch (thumbnailSize) {
          case 'small':
            return 'grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2';
          case 'medium':
            return 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3';
          case 'large':
            return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4';
        }
        break;
      case 'gallery':
      default:
        switch (thumbnailSize) {
          case 'small':
            return 'grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-10 gap-2';
          case 'medium':
            return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4';
          case 'large':
            return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
        }
        break;
    }
  };

  const getThumbnailDimensions = (): { width: string; height: string } => {
    switch (thumbnailSize) {
      case 'small':
        return { width: '80px', height: '80px' };
      case 'large':
        return { width: '300px', height: '300px' };
      case 'medium':
      default:
        return { width: '150px', height: '150px' };
    }
  };

  return (
    <div className={`h-full flex flex-col ${bgClass}`}>
      {/* DEBUG: Show current folder ID */}
      {currentFolderId && (
        <div className="bg-yellow-300 text-black px-4 py-2 text-sm font-bold">
          DEBUG: Currently in folder ID: {currentFolderId}
        </div>
      )}
      
      {/* Breadcrumb Navigation */}
      <div className={`border-b ${borderClass} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm">
            {/* Back Button */}
            <button
              onClick={handleNavigateBack}
              disabled={currentFolderId ? navigationIndex <= 0 : fileNavigationIndex <= 0}
              className={`px-3 py-1 rounded font-medium transition ${
                (currentFolderId ? navigationIndex <= 0 : fileNavigationIndex <= 0)
                  ? theme === 'dark'
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : theme === 'dark'
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-900'
              }`}
              title="Go back to previous directory"
            >
              ← Back
            </button>

            {/* Forward Button */}
            <button
              onClick={handleNavigateForward}
              disabled={currentFolderId ? navigationIndex >= navigationHistory.length - 1 : fileNavigationIndex >= fileNavigationHistory.length - 1}
              className={`px-3 py-1 rounded font-medium transition ${
                (currentFolderId ? navigationIndex >= navigationHistory.length - 1 : fileNavigationIndex >= fileNavigationHistory.length - 1)
                  ? theme === 'dark'
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : theme === 'dark'
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-900'
              }`}
              title="Go forward to next directory"
            >
              Forward →
            </button>

            {/* Separator */}
            <span className={`mx-1 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>|</span>

            <button
              onClick={() => handleNavigate('/')}
              className={`${theme === 'dark' ? 'text-orange-400 hover:text-orange-300' : 'text-orange-600 hover:text-orange-800'}`}
            >
              Home
            </button>
            {currentPath !== '/' &&
              currentPath.split('/').filter(Boolean).map((part, idx, arr) => {
                const path = '/' + arr.slice(0, idx + 1).join('/');
                return (
                  <React.Fragment key={path}>
                    <span className={theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}>/</span>
                    <button
                      onClick={() => handleNavigate(path)}
                      className={`${theme === 'dark' ? 'text-orange-400 hover:text-orange-300' : 'text-orange-600 hover:text-orange-800'}`}
                    >
                      {part}
                    </button>
                  </React.Fragment>
                );
              })}
          </div>
        </div>

        {/* View Mode Selector */}
        <div className="flex gap-2 flex-wrap">
          {/* View Mode Buttons */}
          <div className="flex gap-2 border-r border-gray-300 pr-3">
            {(['list', 'columns', 'grid', 'gallery'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded text-sm font-medium transition ${
                  viewMode === mode
                    ? theme === 'dark'
                      ? 'bg-orange-600 text-white'
                      : 'bg-orange-100 text-orange-700'
                    : theme === 'dark'
                      ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {mode === 'list' && '☰'}
                {mode === 'columns' && '⊞'}
                {mode === 'grid' && '⊟'}
                {mode === 'gallery' && '⋮⋮'}
              </button>
            ))}
          </div>

          {/* Thumbnail Size Buttons - Show for all views with thumbnails */}
          {(viewMode === 'grid' || viewMode === 'gallery' || viewMode === 'columns' || viewMode === 'list') && (
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as ThumbnailSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => setThumbnailSize(size)}
                  className={`px-3 py-1 rounded text-sm font-medium transition ${
                    thumbnailSize === size
                      ? theme === 'dark'
                        ? 'bg-green-600 text-white'
                        : 'bg-green-100 text-green-700'
                      : theme === 'dark'
                        ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {size === 'small' && 'S'}
                  {size === 'medium' && 'M'}
                  {size === 'large' && 'L'}
                </button>
              ))}
            </div>
          )}

          {/* Create Folder Button */}
          <button
            onClick={() => setShowCreateFolderModal(true)}
            className={`px-3 py-1 rounded text-sm font-medium transition ml-auto ${
              currentFolderId
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {currentFolderId ? '+ New SubFolder' : '+ New Folder'}
          </button>

          {/* Move to Folder Button */}
          {selectedMediaIds.size > 0 && (
            <button
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                setMoveToFolderMenuPos({
                  x: rect.left,
                  y: rect.bottom + 5,
                });
              }}
              className={`px-3 py-1 rounded text-sm font-medium transition flex items-center gap-2 ${
                theme === 'dark'
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
              }`}
              title={`Move ${selectedMediaIds.size} item${selectedMediaIds.size === 1 ? '' : 's'} to a folder`}
            >
              <span>📁</span>
              <span>Move to Folder</span>
            </button>
          )}

          {/* Remove from Folder Button - Only show in virtual folders */}
          {currentFolderId && (
            <button
              onClick={async () => {
                if (selectedMediaIds.size === 0) return;
                try {
                  const { removeMediaFromFolder } = useAppStore.getState();
                  await removeMediaFromFolder(currentFolderId, Array.from(selectedMediaIds));
                  setSelectedMediaIds(new Set());
                } catch (error) {
                  console.error('Failed to remove media from folder:', error);
                }
              }}
              disabled={selectedMediaIds.size === 0}
              className={`px-3 py-1 rounded text-sm font-medium transition flex items-center gap-2 ${
                selectedMediaIds.size === 0
                  ? theme === 'dark'
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : theme === 'dark'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
              title={
                selectedMediaIds.size === 0
                  ? 'select items to remove them from this folder'
                  : `remove ${selectedMediaIds.size} item${selectedMediaIds.size === 1 ? '' : 's'} from "${folders[currentFolderId]?.name || 'folder'}" (files will not be deleted)`
              }
            >
              <span>🗑️</span>
              <span>remove</span>
            </button>
          )}
        </div>
      </div>

      {/* File List/Grid */}
      <div className="flex-1 overflow-y-auto p-4 w-full">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-2"></div>
              <p className={textClass}>loading folder...</p>
            </div>
          </div>
        )}

        {error && (
          <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-red-900 bg-opacity-20 border-red-700 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {error}
          </div>
        )}

        {/* Virtual Folders Grid - Show immediately, not waiting for media */}
        {contents && <FolderGrid onMediaDropped={handleFolderMediaDrop} />}

        {contents && !loading && (
          <div className="w-full">
            {/* Media List View */}
            {viewMode === 'list' && (
              <div className="w-full">
                <h3 className={`text-lg font-semibold ${textClass} mb-4`}>media files</h3>
                
                {mediaItems.length === 0 ? (
                  <div className={`p-4 rounded border ${borderClass} ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      no media filesin this directory
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Sortable Table Header */}
                    <div className={`hidden sm:grid grid-cols-12 gap-2 px-2 py-2 border-b ${borderClass} mb-1 w-full overflow-hidden`}>
                      <SortHeader label="Name" column="name" currentColumn={sortColumn} currentOrder={sortOrder} onSort={handleSort} className="col-span-6" />
                      <SortHeader label="Size" column="size" currentColumn={sortColumn} currentOrder={sortOrder} onSort={handleSort} className="col-span-2" />
                      <SortHeader label="Type" column="type" currentColumn={sortColumn} currentOrder={sortOrder} onSort={handleSort} className="col-span-2" />
                      <SortHeader label="Modified" column="modified" currentColumn={sortColumn} currentOrder={sortOrder} onSort={handleSort} className="col-span-2" />
                    </div>

                    {/* Media List Items */}
                    <div className="space-y-0.5 w-full overflow-hidden">
                      {mediaItems.map((item) => (
                        <div
                          key={item.path}
                          className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-2 p-2 sm:p-2 border rounded cursor-pointer transition w-full overflow-hidden ${
                            borderClass
                          } ${hoverClass}`}
                          onClick={() => setSelectedMediaId(item.id)}
                        >
                          {/* Thumbnail + Name */}
                          <div className="sm:col-span-6 flex items-center gap-2 min-w-0">
                            <div 
                              className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-200"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`http://127.0.0.1:8000/api/media/thumbnail/${item.id}?size=80`}
                                alt={item.name || item.path?.split('/').pop() || 'media'}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.src = getFileTypeIcon(item.type);
                                }}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`font-medium truncate ${textClass}`}>{item.name || item.path?.split('/').pop()}</p>
                              <p className={`text-xs truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} sm:hidden`}>
                                {getFileSize(item.size ?? 0)} • {item.type}
                              </p>
                            </div>
                          </div>

                          {/* Size */}
                          <div className="hidden sm:flex sm:col-span-2 items-center min-w-0">
                            <p className={`text-sm truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                              {getFileSize(item.size ?? 0)}
                            </p>
                          </div>

                          {/* Type */}
                          <div className="hidden sm:flex sm:col-span-2 items-center min-w-0">
                            <p className={`text-sm truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                              {(item.type || item.path?.split('.').pop() || '').replace('.', '').toUpperCase()}
                            </p>
                          </div>

                          {/* Modified Date */}
                          <div className="hidden sm:flex sm:col-span-2 items-center min-w-0">
                            <p className={`text-sm truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                              {formatDate(item.modified ?? item.date_taken ?? item.created ?? 0)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Media Grid/Gallery View */}
            {(viewMode === 'grid' || viewMode === 'gallery' || viewMode === 'columns') && mediaItems.length > 0 && (
              <div 
                className="w-full relative"
                ref={mediaGridRef}
                data-drag-container="media-grid"
                onMouseDown={handleMouseDown}
                style={{ position: 'relative' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-lg font-semibold ${textClass}`}>media files</h3>
                  {loadingThumbnails && (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
                      <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>loading thumbnails...</span>
                    </div>
                  )}
                </div>
                <div 
                  className={getGridClasses()}
                  onClick={handleGridClick}
                >
                  {mediaItems.map((item) => {
                    const dims = getThumbnailDimensions();
                    const isSelected = selectedMediaIds.has(item.id);
                    return (
                      <div
                        key={item.path}
                        data-item-id={item.id}
                        data-selectable="true"
                        className={`group relative rounded-lg overflow-hidden cursor-pointer transition ${
                          viewMode === 'columns'
                            ? `p-3 border ${borderClass} ${hoverClass} ${isSelected ? (theme === 'dark' ? 'bg-orange-900 bg-opacity-30 border-orange-500' : 'bg-orange-50 border-orange-400') : ''}`
                            : `aspect-square ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'} hover:ring-2 hover:ring-orange-500 ${isSelected ? 'ring-2 ring-orange-500' : ''}`
                        }`}
                        onClick={(e) => toggleMediaSelection(item.id, e)}
                        onMouseDown={(e) => handleMediaMouseDown(e, item)}
                        style={
                          viewMode === 'columns'
                            ? {}
                            : {
                                width: dims.width,
                                height: dims.height,
                              }
                        }
                      >
                        {viewMode === 'columns' ? (
                          <>
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-200">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`http://127.0.0.1:8000/api/media/thumbnail/${item.id}?size=150`}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  style={{ transform: `rotate(${item.rotation || 0}deg)` }}
                                  onError={(e) => {
                                    e.currentTarget.src = getFileTypeIcon(item.type);
                                  }}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={`font-medium truncate ${textClass}`}>{item.name}</p>
                                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {getFileSize(item.size ?? 0)}
                                </p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`http://127.0.0.1:8000/api/media/thumbnail/${item.id}?size=500`}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                              style={{ transform: `rotate(${item.rotation || 0}deg)` }}
                              onError={(e) => {
                                e.currentTarget.src = getFileTypeIcon(item.type);
                              }}
                            />
                            <div className={`absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition`}></div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Selection Rectangle */}
                {isSelecting && selectionRect && (
                  <SelectionRectangle
                    isActive={true}
                    bounds={{
                      left: Math.min(selectionRect.start.x, selectionRect.current.x),
                      top: Math.min(selectionRect.start.y, selectionRect.current.y),
                      width: Math.abs(selectionRect.current.x - selectionRect.start.x),
                      height: Math.abs(selectionRect.current.y - selectionRect.start.y),
                    }}
                    itemCount={selectedItems.length}
                  />
                )}
              </div>
            )}

            {/* Directories View */}
            {contents.children && (contents.children as (DirectoryNode | MediaItem)[]).some((item) => 'children' in item) && (
              <div>
                <h3 className={`text-lg font-semibold ${textClass} mb-4 mt-6`}>folders</h3>
                <div className="space-y-1">
                  {(contents.children as (DirectoryNode | MediaItem)[]).map((item) => {
                    if (!('children' in item)) return null;
                    const isSelected = selectedFiles.has((item as DirectoryNode).path);

                    return (
                      <div
                        key={item.path}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          isSelected
                            ? theme === 'dark'
                              ? 'bg-orange-900 bg-opacity-30 border-orange-700'
                              : 'bg-orange-50 border-orange-300'
                            : `${hoverClass} border ${borderClass}`
                        }`}
                        onClick={() => toggleFileSelection(item.path)}
                        onDoubleClick={() => handleNavigate(item.path)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="text-xl">📁</div>
                            <div className="min-w-0 flex-1">
                              <div className={`font-medium truncate ${textClass}`}>
                                {item.name}
                              </div>
                              <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                modified: {formatDate('modified' in item ? (item.modified as number) : 0)}
                              </div>
                            </div>
                          </div>
                          <div className={`text-right text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} ml-4`}>
                            {`${('fileCount' in item) ? item.fileCount : 0} files`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {mediaItems.length === 0 && (!contents.children || contents.children.length === 0) && (
              <div className={`text-center py-12 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                <p>this folder is empty</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className={`border-t ${borderClass} px-4 py-2 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'} text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
        <div className="flex justify-between">
          <span>selected: {selectedFiles.size} items | media: {mediaItems.length}</span>
          <span>
            total: {contents ? (contents.fileCount || 0) + (contents.folderCount || 0) : 0} items
          </span>
        </div>
      </div>

      {/* Photo Modal */}
      {selectedMediaId !== null && (
        <BrowsePhotoModal
          isOpen={selectedMediaId !== null}
          media={selectedMediaId !== null ? {
            id: selectedMediaId.toString(),
            image_path: mediaItems.find(m => m.id === selectedMediaId)?.path || '',
            thumbnail: '',
            name: mediaItems.find(m => m.id === selectedMediaId)?.name || mediaItems.find(m => m.id === selectedMediaId)?.path?.split('/').pop() || '',
            rotation: mediaItems.find(m => m.id === selectedMediaId)?.rotation || 0
          } : null}
          onClose={() => setSelectedMediaId(null)}
          onRotate={handleRotate}
        />
      )}

      {/* Create Folder Modal */}
      {showCreateFolderModal && (
        <CreateFolderModal
          isOpen={showCreateFolderModal}
          onClose={() => setShowCreateFolderModal(false)}
          onCreateSuccess={() => setShowCreateFolderModal(false)}
          parentFolderId={currentFolderId || undefined}
        />
      )}

      {/* Move to Folder Context Menu */}
      {moveToFolderMenuPos && (
        <div
          onClick={() => setMoveToFolderMenuPos(null)}
          className="fixed inset-0 z-40"
        >
          <AddToFolderContextMenu
            x={moveToFolderMenuPos.x}
            y={moveToFolderMenuPos.y}
            selectedResultIds={Array.from(selectedMediaIds)}
            onClose={() => {
              setMoveToFolderMenuPos(null);
              setSelectedMediaIds(new Set());
            }}
          />
        </div>
      )}
    </div>
  );
}