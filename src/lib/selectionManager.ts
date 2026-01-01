export interface SelectionState {
  selectedIds: Set<number>;
  isSelecting: boolean;
  startX: number;
  startY: number;
}

export class SelectionManager {
  private state: SelectionState = {
    selectedIds: new Set(),
    isSelecting: false,
    startX: 0,
    startY: 0,
  };

  private selectionRectElement: HTMLElement | null = null;
  private selectableElements: Map<number, HTMLElement> = new Map();

  registerElement(id: number, element: HTMLElement): void {
    this.selectableElements.set(id, element);
  }

  unregisterElement(id: number): void {
    this.selectableElements.delete(id);
  }

  startSelection(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('button, input, [role="button"]')) {
      return;
    }

    this.state.isSelecting = true;
    this.state.startX = event.clientX;
    this.state.startY = event.clientY;

    this.selectionRectElement = document.createElement('div');
    this.selectionRectElement.className = 'selection-rectangle';
    document.body.appendChild(this.selectionRectElement);
  }

  updateSelection(event: MouseEvent): void {
    if (!this.state.isSelecting || !this.selectionRectElement) return;

    const currentX = event.clientX;
    const currentY = event.clientY;

    const left = Math.min(this.state.startX, currentX);
    const top = Math.min(this.state.startY, currentY);
    const width = Math.abs(currentX - this.state.startX);
    const height = Math.abs(currentY - this.state.startY);

    this.selectionRectElement.style.left = left + 'px';
    this.selectionRectElement.style.top = top + 'px';
    this.selectionRectElement.style.width = width + 'px';
    this.selectionRectElement.style.height = height + 'px';

    const rect = {
      left,
      top,
      right: left + width,
      bottom: top + height,
    };

    this.state.selectedIds.clear();
    this.selectableElements.forEach((element, id) => {
      const bounds = element.getBoundingClientRect();
      if (this.isIntersecting(rect, bounds)) {
        this.state.selectedIds.add(id);
        element.classList.add('selected');
      } else {
        element.classList.remove('selected');
      }
    });
  }

  endSelection(): void {
    this.state.isSelecting = false;
    if (this.selectionRectElement) {
      this.selectionRectElement.remove();
      this.selectionRectElement = null;
    }
  }

  private isIntersecting(
    rect1: { left: number; top: number; right: number; bottom: number },
    rect2: DOMRect
  ): boolean {
    return !(
      rect1.right < rect2.left ||
      rect1.left > rect2.right ||
      rect1.bottom < rect2.top ||
      rect1.top > rect2.bottom
    );
  }

  toggleSelection(id: number, multiSelect: boolean = false): void {
    if (!multiSelect) {
      this.state.selectedIds.clear();
      this.selectableElements.forEach((element) => {
        element.classList.remove('selected');
      });
    }

    if (this.state.selectedIds.has(id)) {
      this.state.selectedIds.delete(id);
      this.selectableElements.get(id)?.classList.remove('selected');
    } else {
      this.state.selectedIds.add(id);
      this.selectableElements.get(id)?.classList.add('selected');
    }
  }

  clearSelection(): void {
    this.state.selectedIds.clear();
    this.selectableElements.forEach((element) => {
      element.classList.remove('selected');
    });
  }

  getSelectedIds(): number[] {
    return Array.from(this.state.selectedIds);
  }

  isSelected(id: number): boolean {
    return this.state.selectedIds.has(id);
  }

  getSelectionCount(): number {
    return this.state.selectedIds.size;
  }
}

export const selectionManager = new SelectionManager();
