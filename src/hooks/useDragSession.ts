import { useState, useCallback, useRef, useEffect } from 'react';

export interface DragItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path?: string;
  size?: number;
  thumbnailUrl?: string;
}

export interface DropTarget {
  id: string;
  name: string;
  element: HTMLElement;
  path?: string;
  canAccept: (items: DragItem[]) => boolean;
}

export interface DragSession {
  id: string;
  items: DragItem[];
  ghostImages: HTMLElement[];
  originPosition: { x: number; y: number };
  operation: 'move' | 'copy';
  timestamp: number;
  dropTarget?: DropTarget | null;
}

let dragSessionCounter = 0;

const generateSessionId = (): string => {
  return `drag-session-${++dragSessionCounter}-${Date.now()}`;
};

export const useDragSession = () => {
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [dragCursorPosition, setDragCursorPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const ghostContainerRef = useRef<HTMLDivElement | null>(null);

  const createGhostImages = useCallback((items: DragItem[], origin: HTMLElement) => {
    if (ghostContainerRef.current) {
      ghostContainerRef.current.remove();
    }

    const container = document.createElement('div');
    container.id = 'drag-ghost-container';
    container.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 10000;
    `;
    document.body.appendChild(container);
    ghostContainerRef.current = container;

    const ghostImages = items.slice(0, 3).map((item, index) => {
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost-item';
      ghost.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: ${10000 + index};
        opacity: 0.7;
        transform: rotate(${index * 5}deg) scale(0.9);
        transition: transform 0.1s ease;
      `;

      if (item.thumbnailUrl && item.type === 'file') {
        ghost.innerHTML = `
          <div style="
            width: 80px;
            height: 80px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(0, 122, 255, 0.3);
          ">
            <img 
              src="${item.thumbnailUrl}" 
              alt="${item.name}"
              style="
                width: 100%;
                height: 100%;
                object-fit: cover;
              "
              onerror="this.style.display='none'"
            />
          </div>
        `;
      } else {
        ghost.innerHTML = `
          <div style="
            width: 80px;
            height: 80px;
            border-radius: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(0, 122, 255, 0.3);
          ">
            ${item.type === 'folder' ? '📁' : '📄'}
          </div>
        `;
      }

      container.appendChild(ghost);
      return ghost;
    });

    if (items.length > 3) {
      const badge = document.createElement('div');
      badge.style.cssText = `
        position: fixed;
        width: 32px;
        height: 32px;
        background: rgba(0, 122, 255, 0.9);
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        z-index: 10003;
      `;
      badge.textContent = `+${items.length - 3}`;
      container.appendChild(badge);
      ghostImages.push(badge);
    }

    return ghostImages;
  }, []);

  const startDragSession = useCallback(
    (items: DragItem[], origin: HTMLElement, operation: 'move' | 'copy' = 'move') => {
      const sessionId = generateSessionId();
      const ghostImages = createGhostImages(items, origin);
      const originRect = origin.getBoundingClientRect();

      const session: DragSession = {
        id: sessionId,
        items,
        ghostImages,
        originPosition: { x: originRect.left, y: originRect.top },
        operation,
        timestamp: Date.now(),
      };

      setDragSession(session);

      return sessionId;
    },
    [createGhostImages]
  );

  const updateDragPosition = useCallback((x: number, y: number) => {
    setDragCursorPosition({ x, y });

    if (dragSession && dragSession.ghostImages.length > 0) {
      dragSession.ghostImages.forEach((ghost, index) => {
        const offsetX = index * 10;
        const offsetY = index * 10;
        ghost.style.left = `${x + offsetX}px`;
        ghost.style.top = `${y + offsetY}px`;
      });
    }
  }, [dragSession]);

  const findDropTarget = useCallback((x: number, y: number, targets: DropTarget[]): DropTarget | null => {
    for (const target of targets) {
      const rect = target.element.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return target;
      }
    }
    return null;
  }, []);

  const highlightDropTarget = useCallback(
    (target: DropTarget | null) => {
      setDropTarget(target);

      if (target && dragSession) {
        const canDrop = target.canAccept(dragSession.items);
        target.element.style.backgroundColor = canDrop
          ? 'rgba(52, 199, 89, 0.1)'
          : 'rgba(255, 59, 48, 0.1)';
        target.element.style.borderColor = canDrop ? 'rgba(52, 199, 89, 0.5)' : 'rgba(255, 59, 48, 0.5)';
        target.element.style.borderStyle = 'dashed';
        target.element.style.borderWidth = '2px';
      }
    },
    [dragSession]
  );

  const clearDropTargetHighlight = useCallback((target: DropTarget | null) => {
    if (target) {
      target.element.style.backgroundColor = '';
      target.element.style.borderColor = '';
      target.element.style.borderStyle = '';
      target.element.style.borderWidth = '';
    }
  }, []);

  const endDragSession = useCallback(() => {
    if (ghostContainerRef.current) {
      ghostContainerRef.current.remove();
      ghostContainerRef.current = null;
    }

    clearDropTargetHighlight(dropTarget);
    setDragSession(null);
    setDropTarget(null);
  }, [dropTarget, clearDropTargetHighlight]);

  return {
    dragSession,
    dropTarget,
    dragCursorPosition,
    isDragging: !!dragSession,
    startDragSession,
    updateDragPosition,
    findDropTarget,
    highlightDropTarget,
    clearDropTargetHighlight,
    endDragSession,
  };
};
