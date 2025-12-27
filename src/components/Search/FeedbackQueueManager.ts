/**
 * Feedback Queue Manager - Handles offline feedback and sync to backend
 */

import { FeedbackItem, FeedbackAction } from './types';

const FEEDBACK_STORE_NAME = 'search_feedback_queue';
const DB_NAME = 'dudlefotos_app';
const DB_VERSION = 1;

export class FeedbackQueueManager {
  private queue: FeedbackItem[] = [];
  private isSyncing = false;
  private db: IDBDatabase | null = null;
  private onQueueChange: ((queue: FeedbackItem[]) => void) | null = null;
  private retryCount = 0;
  private maxRetries = 3;

  async init(): Promise<void> {
    try {
      this.db = await this.openDB();
      await this.loadFromStorage();
      await this.clearAllFailedItems();
    } catch (err) {
      console.error('[FEEDBACK_QUEUE] Failed to initialize:', err);
    }
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(FEEDBACK_STORE_NAME)) {
          db.createObjectStore(FEEDBACK_STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  private async loadFromStorage(): Promise<void> {
    try {
      if (!this.db) return;

      const tx = this.db.transaction(FEEDBACK_STORE_NAME, 'readonly');
      const store = tx.objectStore(FEEDBACK_STORE_NAME);
      const request = store.getAll();

      const items = await new Promise<FeedbackItem[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      this.queue = items;
      console.log(`[FEEDBACK_QUEUE] Loaded ${items.length} queued items from storage`);
    } catch (err) {
      console.error('[FEEDBACK_QUEUE] Failed to load from storage:', err);
    }
  }

  add(
    action: FeedbackAction,
    imageId: number,
    imagePath: string,
    query: string,
    keywords?: string[]
  ): FeedbackItem {
    const item: FeedbackItem = {
      id: `${Date.now()}_${Math.random()}`,
      action,
      imageId,
      imagePath,
      query,
      timestamp: Date.now(),
      ...(keywords && { keywords }),
      synced: false,
      retryCount: 0,
    };

    this.queue.push(item);
    this.saveToStorage(item);
    this.notifyChange();
    this.trySync();

    return item;
  }

  private async saveToStorage(item: FeedbackItem): Promise<void> {
    try {
      if (!this.db) return;

      const tx = this.db.transaction(FEEDBACK_STORE_NAME, 'readwrite');
      const store = tx.objectStore(FEEDBACK_STORE_NAME);
      store.put(item);
    } catch (err) {
      console.error('[FEEDBACK_QUEUE] Failed to save to storage:', err);
    }
  }

  private async removeFromStorage(id: string): Promise<void> {
    try {
      if (!this.db) return;

      const tx = this.db.transaction(FEEDBACK_STORE_NAME, 'readwrite');
      const store = tx.objectStore(FEEDBACK_STORE_NAME);
      store.delete(id);
    } catch (err) {
      console.error('[FEEDBACK_QUEUE] Failed to remove from storage:', err);
    }
  }

  private async clearAllFailedItems(): Promise<void> {
    try {
      if (!this.db) return;

      const tx = this.db.transaction(FEEDBACK_STORE_NAME, 'readwrite');
      const store = tx.objectStore(FEEDBACK_STORE_NAME);
      const request = store.getAll();

      const items = await new Promise<FeedbackItem[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      for (const item of items) {
        if (item.error) {
          store.delete(item.id);
          console.log(`[FEEDBACK_QUEUE] Cleared failed item: ${item.id}`);
        }
      }
    } catch (err) {
      console.error('[FEEDBACK_QUEUE] Failed to clear failed items:', err);
    }
  }

  async trySync(): Promise<void> {
    if (!navigator.onLine || this.isSyncing || this.queue.length === 0) {
      return;
    }

    this.isSyncing = true;
    console.log(`[FEEDBACK_QUEUE] Starting sync for ${this.queue.length} items`);

    while (this.queue.length > 0) {
      const item = this.queue[0];

      try {
        await this.sendToBackend(item);
        this.queue.shift();
        await this.removeFromStorage(item.id);
        this.retryCount = 0;
        this.notifyChange();
        console.log(`[FEEDBACK_QUEUE] Synced: ${item.id}`);
      } catch (error) {
        this.retryCount++;
        console.error(`[FEEDBACK_QUEUE] Sync failed (attempt ${this.retryCount}):`, error);

        if (this.retryCount >= this.maxRetries) {
          item.error = error instanceof Error ? error.message : 'Unknown error';
          this.queue.shift();
          await this.removeFromStorage(item.id);
          this.retryCount = 0;
        }

        break;
      }
    }

    this.isSyncing = false;
    this.notifyChange();
  }

  private async sendToBackend(item: FeedbackItem): Promise<void> {
    const action = item.action === 'confirm' ? 'approve' : 'reject';
    const BACKEND_URL = 'http://localhost:8000';
    const endpoint = `${BACKEND_URL}/api/search/${encodeURIComponent(item.query)}/${action}?file_id=${item.imageId}`;

    console.log(`[FEEDBACK_QUEUE] Sending to backend: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.statusText}`);
    }
  }

  getQueue(): FeedbackItem[] {
    return [...this.queue];
  }

  onQueueUpdated(callback: (queue: FeedbackItem[]) => void): () => void {
    this.onQueueChange = callback;
    return () => {
      this.onQueueChange = null;
    };
  }

  private notifyChange(): void {
    this.onQueueChange?.([...this.queue]);
  }

  getPendingCount(): number {
    return this.queue.length;
  }

  getSyncStatus(): 'idle' | 'syncing' | 'error' {
    if (this.isSyncing) return 'syncing';
    if (this.retryCount > 0) return 'error';
    return 'idle';
  }
}

export const feedbackQueue = new FeedbackQueueManager();
