export interface DragState {
  isDragging: boolean;
  selectedItems: Set<string>;
  dragSource: HTMLElement | null;
  dragOffset: { x: number; y: number };
}

export interface DropTarget {
  id: string;
  element: HTMLElement;
  onDrop: (items: string[], sourceEvent: DragEvent) => Promise<void>;
  onDragOver?: (items: string[]) => void;
  onDragLeave?: () => void;
}

export interface SelectionRectangle {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isActive: boolean;
}

class DragManager {
  private dragState: DragState = {
    isDragging: false,
    selectedItems: new Set(),
    dragSource: null,
    dragOffset: { x: 0, y: 0 },
  };

  private dropTargets: Map<string, DropTarget> = new Map();
  private selectionRectangle: SelectionRectangle = {
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    isActive: false,
  };

  private dragThreshold = 5;
  private dragGhostElement: HTMLElement | null = null;

  registerDropTarget(target: DropTarget): void {
    this.dropTargets.set(target.id, target);

    target.element.addEventListener('dragover', (e) => this.handleDragOver(e, target.id));
    target.element.addEventListener('dragleave', (e) => this.handleDragLeave(e, target.id));
    target.element.addEventListener('drop', (e) => this.handleDrop(e, target.id));
  }

  unregisterDropTarget(id: string): void {
    const target = this.dropTargets.get(id);
    if (target) {
      target.element.removeEventListener('dragover', () => {});
      target.element.removeEventListener('dragleave', () => {});
      target.element.removeEventListener('drop', () => {});
    }
    this.dropTargets.delete(id);
  }

  startDrag(items: string[], source: HTMLElement, event: MouseEvent): void {
    this.dragState.isDragging = true;
    this.dragState.selectedItems = new Set(items);
    this.dragState.dragSource = source;
    this.dragState.dragOffset = {
      x: event.clientX,
      y: event.clientY,
    };

    this.createDragGhost(items.length);
  }

  updateDrag(event: MouseEvent): void {
    if (!this.dragState.isDragging || !this.dragGhostElement) return;

    this.dragGhostElement.style.left = event.clientX + 10 + 'px';
    this.dragGhostElement.style.top = event.clientY + 10 + 'px';
  }

  async endDrag(targetId?: string): Promise<void> {
    if (!this.dragState.isDragging) return;

    if (targetId) {
      const target = this.dropTargets.get(targetId);
      if (target) {
        try {
          const items = Array.from(this.dragState.selectedItems);
          await target.onDrop(items, new DragEvent('drop'));
        } catch (error) {
          console.error('Drop operation failed:', error);
        }
      }
    }

    this.cleanup();
  }

  private handleDragOver(event: DragEvent, targetId: string): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';

    const target = this.dropTargets.get(targetId);
    if (target && target.onDragOver) {
      target.onDragOver(Array.from(this.dragState.selectedItems));
    }

    target?.element.classList.add('drag-over');
  }

  private handleDragLeave(event: DragEvent, targetId: string): void {
    const target = this.dropTargets.get(targetId);
    if (target && target.onDragLeave) {
      target.onDragLeave();
    }

    target?.element.classList.remove('drag-over');
  }

  private async handleDrop(event: DragEvent, targetId: string): Promise<void> {
    event.preventDefault();
    await this.endDrag(targetId);
  }

  private createDragGhost(count: number): void {
    this.dragGhostElement = document.createElement('div');
    this.dragGhostElement.className = 'drag-ghost';
    this.dragGhostElement.innerHTML = `
      <div class="drag-ghost-content">
        <div class="drag-ghost-icon">📁</div>
        <div class="drag-ghost-count">${count} item${count !== 1 ? 's' : ''}</div>
      </div>
    `;
    this.dragGhostElement.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 10000;
      opacity: 0.8;
      background: rgba(59, 130, 246, 0.2);
      border: 2px solid rgba(59, 130, 246, 0.5);
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    document.body.appendChild(this.dragGhostElement);
  }

  private cleanup(): void {
    this.dragState.isDragging = false;
    this.dragState.selectedItems.clear();
    this.dragState.dragSource = null;

    if (this.dragGhostElement) {
      this.dragGhostElement.remove();
      this.dragGhostElement = null;
    }

    this.dropTargets.forEach((target) => {
      target.element.classList.remove('drag-over');
    });
  }

  getDragState(): Readonly<DragState> {
    return { ...this.dragState, selectedItems: new Set(this.dragState.selectedItems) };
  }

  isSelected(itemId: string): boolean {
    return this.dragState.selectedItems.has(itemId);
  }
}

export const dragManager = new DragManager();
