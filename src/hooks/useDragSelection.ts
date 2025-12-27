import { useState, useCallback, useRef, useEffect } from 'react';

export interface SelectionBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SelectionRect {
  start: { x: number; y: number };
  current: { x: number; y: number };
  scrollOffset: { x: number; y: number };
}

export const useDragSelection = (
  containerRef: React.RefObject<HTMLElement>,
  onSelectionChange?: (selectedItems: string[]) => void,
  onThumbnailDragStart?: (itemId: string) => void,
  currentSelectedItems?: Set<string>
) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const startScrollRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const selectedItemsRef = useRef<Set<string>>(new Set());
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartThresholdRef = useRef<number>(2);
  const hasMovedRef = useRef<boolean>(false);
  const isMouseDownRef = useRef<boolean>(false);
  const clickedOnSelectedItemRef = useRef<boolean>(false);

  const calculateBounds = useCallback(
    (startPoint: { x: number; y: number }, currentPoint: { x: number; y: number }, scrollOffset: { x: number; y: number }): SelectionBounds | null => {
      if (!containerRef.current) return null;

      const containerRect = containerRef.current.getBoundingClientRect();
      const scrollTop = containerRef.current.scrollTop;
      const scrollLeft = containerRef.current.scrollLeft;

      const normalizedStart = {
        x: startPoint.x - containerRect.left + scrollLeft,
        y: startPoint.y - containerRect.top + scrollTop,
      };

      const normalizedCurrent = {
        x: currentPoint.x - containerRect.left + scrollLeft,
        y: currentPoint.y - containerRect.top + scrollTop,
      };

      return {
        left: Math.min(normalizedStart.x, normalizedCurrent.x),
        top: Math.min(normalizedStart.y, normalizedCurrent.y),
        width: Math.abs(normalizedCurrent.x - normalizedStart.x),
        height: Math.abs(normalizedCurrent.y - normalizedStart.y),
      };
    },
    [containerRef]
  );

  const getItemsInBounds = useCallback(
    (bounds: SelectionBounds): string[] => {
      if (!containerRef.current) return [];

      const items: string[] = [];
      const elements = containerRef.current.querySelectorAll('[data-selectable="true"]');

      elements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const containerRect = containerRef.current!.getBoundingClientRect();
        const scrollTop = containerRef.current!.scrollTop;
        const scrollLeft = containerRef.current!.scrollLeft;

        const elementLeft = rect.left - containerRect.left + scrollLeft;
        const elementTop = rect.top - containerRect.top + scrollTop;
        const elementRight = elementLeft + rect.width;
        const elementBottom = elementTop + rect.height;

        const boundsLeft = bounds.left;
        const boundsTop = bounds.top;
        const boundsRight = bounds.left + bounds.width;
        const boundsBottom = bounds.top + bounds.height;


        if (
          elementLeft < boundsRight &&
          elementRight > boundsLeft &&
          elementTop < boundsBottom &&
          elementBottom > boundsTop
        ) {
          const itemId = element.getAttribute('data-item-id');
          if (itemId) {
            items.push(itemId);
          }
        }
      });

      return items;
    },
    [containerRef]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {

      if (!containerRef.current?.contains(e.target as Node)) return;


      if (e.button !== 0) return;


      const clickedElement = e.target as HTMLElement;
      const selectableElement = clickedElement.closest('[data-selectable="true"]');
      const clickedItemId = selectableElement?.getAttribute('data-item-id');
      clickedOnSelectedItemRef.current = !!(clickedItemId && currentSelectedItems?.has(clickedItemId));



      if (clickedOnSelectedItemRef.current) {
        isMouseDownRef.current = true;
        return;
      }

      isMouseDownRef.current = true;
      const startPoint = { x: e.clientX, y: e.clientY };
      startPointRef.current = startPoint;
      startScrollRef.current = {
        x: containerRef.current?.scrollLeft || 0,
        y: containerRef.current?.scrollTop || 0,
      };

      hasMovedRef.current = false;
      

      setIsSelecting(true);
      setSelectionRect({
        start: startPoint,
        current: startPoint,
        scrollOffset: { x: 0, y: 0 },
      });
      selectedItemsRef.current.clear();
      setSelectedItems([]);
      

      e.preventDefault();
    },
    [containerRef, currentSelectedItems]
  );

  const handleAutoScroll = useCallback(
    (currentPoint: { x: number; y: number }) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const scrollThreshold = 50;
      const scrollSpeed = 10;

      let scrollX = 0;
      let scrollY = 0;


      if (currentPoint.x > containerRect.right - scrollThreshold) {
        scrollX = scrollSpeed;
      }

      else if (currentPoint.x < containerRect.left + scrollThreshold) {
        scrollX = -scrollSpeed;
      }


      if (currentPoint.y > containerRect.bottom - scrollThreshold) {
        scrollY = scrollSpeed;
      }

      else if (currentPoint.y < containerRect.top + scrollThreshold) {
        scrollY = -scrollSpeed;
      }

      if (scrollX !== 0 || scrollY !== 0) {
        containerRef.current.scrollLeft += scrollX;
        containerRef.current.scrollTop += scrollY;
      }
    },
    [containerRef]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {

      if (clickedOnSelectedItemRef.current) {
        return;
      }

      if (!isSelecting || !startPointRef.current || !isMouseDownRef.current) return;

      const currentPoint = { x: e.clientX, y: e.clientY };
      

      const distance = Math.sqrt(
        Math.pow(currentPoint.x - startPointRef.current.x, 2) +
        Math.pow(currentPoint.y - startPointRef.current.y, 2)
      );


      if (distance < dragStartThresholdRef.current) {
        return;
      }


      if (!hasMovedRef.current) {
        hasMovedRef.current = true;
      }
      

      handleAutoScroll(currentPoint);
      

      const currentScroll = {
        x: containerRef.current?.scrollLeft || 0,
        y: containerRef.current?.scrollTop || 0,
      };
      
      const scrollOffset = {
        x: currentScroll.x - startScrollRef.current.x,
        y: currentScroll.y - startScrollRef.current.y,
      };

      setSelectionRect({
        start: startPointRef.current,
        current: currentPoint,
        scrollOffset,
      });


      const bounds = calculateBounds(startPointRef.current, currentPoint, scrollOffset);
      if (bounds && (bounds.width > 2 || bounds.height > 2)) {
        const itemsInBounds = getItemsInBounds(bounds);
        selectedItemsRef.current = new Set(itemsInBounds);
        setSelectedItems(itemsInBounds);
        onSelectionChange?.(itemsInBounds);
      }
    },
    [isSelecting, calculateBounds, getItemsInBounds, onSelectionChange, handleAutoScroll, containerRef]
  );

  const handleMouseUp = useCallback(() => {
    isMouseDownRef.current = false;
    clickedOnSelectedItemRef.current = false;
    

    if (selectedItemsRef.current.size > 0) {
      onSelectionChange?.(Array.from(selectedItemsRef.current));
    }
    

    setIsSelecting(false);
    

    setTimeout(() => {
      setSelectionRect(null);
    }, 100);
  }, [onSelectionChange]);


  useEffect(() => {
    if (isSelecting && isMouseDownRef.current) {
      const handleDocMouseMove = (e: MouseEvent) => handleMouseMove(e);
      const handleDocMouseUp = () => handleMouseUp();

      document.addEventListener('mousemove', handleDocMouseMove);
      document.addEventListener('mouseup', handleDocMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleDocMouseMove);
        document.removeEventListener('mouseup', handleDocMouseUp);
      };
    }
  }, [isSelecting, handleMouseMove, handleMouseUp]);

  return {
    isSelecting,
    selectionRect,
    selectedItems,
    handleMouseDown,
    clearSelection: () => {
      selectedItemsRef.current.clear();
      setSelectedItems([]);
      setSelectionRect(null);
    },
  };
};
