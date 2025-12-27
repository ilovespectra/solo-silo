/**
 * Search and Feedback System Types
 */

export interface SearchResult {
  id: number;
  path: string;
  type: string;
  thumbnail?: string;
  keywords?: string[];
  date_taken?: number;
  width?: number;
  height?: number;
  size?: number;
  similarity?: number;
  score?: number;
  camera?: string;
  lens?: string;
  rotation?: number;
  
  confirmed_for_query?: boolean;
  
  confirmed?: boolean;
  removed?: boolean;
  boosted?: boolean;
}

export type FeedbackAction = 'confirm' | 'remove' | 'keyword_add' | 'keyword_remove';

export interface FeedbackItem {
  id: string;
  action: FeedbackAction;
  imageId: number;
  imagePath: string;
  query: string;
  keywords?: string[];
  timestamp: number;
  synced: boolean;
  retryCount: number;
  error?: string;
}

export interface SearchPreferences {
  confidenceThreshold: number;
  displayCount: number;
  keywords: string[];
}

export interface SearchState {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  query: string;
  total: number;
  offset: number;
  feedbackQueue: FeedbackItem[];
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
}

export interface FeedbackPayload {
  action: FeedbackAction;
  media_id: number;
  query: string;
  timestamp: number;
  keywords?: string[];
}
