/**
 * Audio metadata cache using localStorage
 * Stores audio file list for fast subsequent loads
 */

const AUDIO_CACHE_KEY_PREFIX = 'silo-audio-cache';
const AUDIO_CACHE_EXPIRY_KEY_PREFIX = 'silo-audio-cache-expiry';
const CACHE_DURATION_MS = 1000 * 60 * 60;

function getAudioCacheKey(siloName?: string): string {
  return siloName ? `${AUDIO_CACHE_KEY_PREFIX}-${siloName}` : AUDIO_CACHE_KEY_PREFIX;
}

function getAudioCacheExpiryKey(siloName?: string): string {
  return siloName ? `${AUDIO_CACHE_EXPIRY_KEY_PREFIX}-${siloName}` : AUDIO_CACHE_EXPIRY_KEY_PREFIX;
}

interface AudioItem {
  id: number;
  path: string;
  type: string;
  date_taken?: number;
  size?: number;
}

interface AudioCacheData {
  items: AudioItem[];
  timestamp: number;
}

/**
 * Get cached audio files if available and fresh
 */
export function getCachedAudio(siloName?: string): AudioItem[] | null {
  try {
    const cacheKey = getAudioCacheKey(siloName);
    const expiryKey = getAudioCacheExpiryKey(siloName);
    
    const cached = localStorage.getItem(cacheKey);
    const expiry = localStorage.getItem(expiryKey);

    if (!cached || !expiry) {
      return null;
    }

    const expiryTime = parseInt(expiry, 10);
    if (Date.now() > expiryTime) {
      clearAudioCache(siloName);
      return null;
    }

    const data: AudioCacheData = JSON.parse(cached);
    console.log('[AudioCache] Using cached audio data with', data.items.length, 'files');
    return data.items;
  } catch (err) {
    console.error('[AudioCache] Error reading cache:', err);
    return null;
  }
}

export function cacheAudio(items: AudioItem[], siloName?: string): void {
  try {
    const cacheKey = getAudioCacheKey(siloName);
    const expiryKey = getAudioCacheExpiryKey(siloName);
    
    const data: AudioCacheData = {
      items,
      timestamp: Date.now(),
    };

    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(expiryKey, (Date.now() + CACHE_DURATION_MS).toString());
    console.log('[AudioCache] Cached', items.length, 'audio files');
  } catch (err) {
    console.error('[AudioCache] Error writing cache:', err);
  }
}

export function clearAudioCache(siloName?: string): void {
  try {
    const cacheKey = getAudioCacheKey(siloName);
    const expiryKey = getAudioCacheExpiryKey(siloName);
    
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(expiryKey);
    console.log('[AudioCache] Cache cleared');
  } catch (err) {
    console.error('[AudioCache] Error clearing cache:', err);
  }
}

export function isAudioCacheFresh(siloName?: string): boolean {
  try {
    const expiryKey = getAudioCacheExpiryKey(siloName);
    const expiry = localStorage.getItem(expiryKey);
    if (!expiry) return false;

    const expiryTime = parseInt(expiry, 10);
    return Date.now() <= expiryTime;
  } catch {
    return false;
  }
}
