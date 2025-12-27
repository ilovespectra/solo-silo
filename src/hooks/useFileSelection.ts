import { useState, useRef, useCallback } from 'react';

export interface SelectionState {
  selectedIds: Set<number>;
  isDragging: boolean;
  isRectangleSelection: boolean;
  rectangleBounds: RectangleBounds | null;
  dragOrigin: { x: number; y: number } | null;
}

export interface RectangleBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const DRAG_THRESHOLD = 5;

export const useFileSelection = (
  containerRef: React.RefObject<HTMLElement>,
  onSelectionChange?: (selectedIds: Set<number>) => void,
) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isRectangleSelection, setIsRectangleSelection] = useState(false);
  const [rectangleBounds, setRectangleBounds] = useState<RectangleBounds | null>(null);

  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const startedOnThumbnailRef = useRef(false);
  const distanceMovedRef = useRef(0);
  const thumbnailCacheRef = useRef<Map<number, DOMRect> | null>(null);

  const getThumbnailBounds = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  const isThumbnail = useCallback((target: HTMLElement | null): boolean => {
    if (!target) return false;
    return !!target.closest('[data-media-item]');
  }, []);

  const getThumbnailElement = useCallback((target: HTMLElement): HTMLElement | null => {
    return target.closest('[data-media-item]') as HTMLElement || null;
  }, []);


  const getThumbnailId = useCallback((el: HTMLElement): number | null => {
    const id = el.getAttribute('data-media-item');
    return id ? parseInt(id) : null;
  }, []);

  const buildThumbnailCache = useCallback((): Map<number, DOMRect> => {
    if (!containerRef.current) return new Map();

    const cache = new Map<number, DOMRect>();
    const thumbnails = containerRef.current.querySelectorAll('[data-media-item]');

    thumbnails.forEach(el => {
      const id = (el as HTMLElement).getAttribute('data-media-item');
      if (id) {
        cache.set(parseInt(id), el.getBoundingClientRect());
      }
    });

    return cache;
  }, [containerRef]);

  const calculateRectangleBounds = useCallback(
    (startX: number, startY: number, currentX: number, currentY: number): RectangleBounds => {
      return {
        left: Math.min(startX, currentX),
        top: Math.min(startY, currentY),
        width: Math.abs(currentX - startX),
        height: Math.abs(currentY - startY),
      };
    },
    []
  );

  const getThumbnailsInBounds = useCallback((bounds: RectangleBounds): Set<number> => {
    if (!thumbnailCacheRef.current) {
      thumbnailCacheRef.current = buildThumbnailCache();
    }

    const cache = thumbnailCacheRef.current;
    const items = new Set<number>();

    cache.forEach((rect, id) => {
      if (
        rect.left < bounds.left + bounds.width &&
        rect.right > bounds.left &&
        rect.top < bounds.top + bounds.height &&
        rect.bottom > bounds.top
      ) {
        items.add(id);
      }
    });

    return items;
  }, [buildThumbnailCache]);

  const updateSelection = useCallback((newSelection: Set<number>) => {
    setSelectedIds(newSelection);
    onSelectionChange?.(newSelection);
  }, [onSelectionChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    const onThumbnail = isThumbnail(target);

    dragOriginRef.current = { x: e.clientX, y: e.clientY };
    distanceMovedRef.current = 0;
    startedOnThumbnailRef.current = onThumbnail;
    thumbnailCacheRef.current = null;
    setIsDragging(true);
  }, [isThumbnail]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!dragOriginRef.current || !isDragging) return;

    const dx = e.clientX - dragOriginRef.current.x;
    const dy = e.clientY - dragOriginRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    distanceMovedRef.current = distance;

    if (startedOnThumbnailRef.current || distance < DRAG_THRESHOLD) return;

    const bounds = calculateRectangleBounds(
      dragOriginRef.current.x,
      dragOriginRef.current.y,
      e.clientX,
      e.clientY
    );

    setRectangleBounds(bounds);
    setIsRectangleSelection(true);

    const itemsInBounds = getThumbnailsInBounds(bounds);
    updateSelection(itemsInBounds);

    e.preventDefault();
  }, [isDragging, calculateRectangleBounds, getThumbnailsInBounds, updateSelection]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!dragOriginRef.current) return;

    const distance = distanceMovedRef.current;

    if (distance < DRAG_THRESHOLD) {
      const target = e.target as HTMLElement;
      const onThumbnail = isThumbnail(target);

      if (!onThumbnail) {
        updateSelection(new Set());
      }
    }

    dragOriginRef.current = null;
    setIsDragging(false);
    setIsRectangleSelection(false);
    setRectangleBounds(null);
    startedOnThumbnailRef.current = false;
    distanceMovedRef.current = 0;
    thumbnailCacheRef.current = null;

    e.preventDefault();
  }, [isThumbnail, updateSelection]);

  const handleThumbnailClick = useCallback(
    (itemId: number, e: React.MouseEvent) => {
      if (distanceMovedRef.current >= DRAG_THRESHOLD) {
        return;
      }

      const isCtrlCmd = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;

      if (isCtrlCmd) {
        const newSelection = new Set(selectedIds);
        if (newSelection.has(itemId)) {
          newSelection.delete(itemId);
        } else {
          newSelection.add(itemId);
        }
        updateSelection(newSelection);
      } else if (isShift) {
        const newSelection = new Set(selectedIds);
        newSelection.add(itemId);
        updateSelection(newSelection);
      } else {
        updateSelection(new Set([itemId]));
      }

      e.stopPropagation();
    },
    [selectedIds, updateSelection]
  );

  const clearSelection = useCallback(() => {
    updateSelection(new Set());
  }, [updateSelection]);

  const selectMultiple = useCallback((ids: number[]) => {
    updateSelection(new Set(ids));
  }, [updateSelection]);


  const addToSelection = useCallback((id: number) => {
    const newSelection = new Set(selectedIds);
    newSelection.add(id);
    updateSelection(newSelection);
  }, [selectedIds, updateSelection]);

  const removeFromSelection = useCallback((id: number) => {
    const newSelection = new Set(selectedIds);
    newSelection.delete(id);
    updateSelection(newSelection);
  }, [selectedIds, updateSelection]);

  return {
    selectedIds,
    isDragging,
    isRectangleSelection,
    rectangleBounds,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleThumbnailClick,
    clearSelection,
    selectMultiple,
    addToSelection,
    removeFromSelection,
    isThumbnail,
    getThumbnailElement,
    getThumbnailId,
    getThumbnailsInBounds,
  };
};
