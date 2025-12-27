'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import AudioVisualizer from './AudioVisualizer';

interface AudioItem {
  id: number;
  path: string;
  type: string;
  date_taken?: number;
  size?: number;
}

interface AudioPlayerProps {
  audio: AudioItem;
  allAudio: AudioItem[];
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export default function AudioPlayer({
  audio,
  allAudio,
  onClose,
  onNext,
  onPrevious,
}: AudioPlayerProps) {
  const { theme } = useAppStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const audioUrl = `/api/media/file/${audio.id}`;
  
  const getFileExtension = useCallback(() => {
    const ext = audio.path.split('.').pop()?.toLowerCase() || '';
    return ext;
  }, [audio.path]);

  const isAifFormat = useCallback(() => {
    return getFileExtension() === 'aif' || getFileExtension() === 'aiff';
  }, [getFileExtension]);

  useEffect(() => {
    if (audioRef.current) {
      console.log('[AudioPlayer] Setting audio src to:', audioUrl);
      audioRef.current.src = audioUrl;
      audioRef.current.volume = volume;
      
      if (isAifFormat()) {
        console.log('[AudioPlayer] AIF file detected - conversion will happen on backend');
      }
    }
  }, [audioUrl, volume, isAifFormat]);

  const handlePlayPause = async () => {
    if (!audioRef.current) {
      console.error('[AudioPlayer] Audio element not available');
      setError('Audio element not available');
      return;
    }

    try {
      console.log('[AudioPlayer] Play/pause clicked. Currently playing:', isPlaying);
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        console.log('[AudioPlayer] Paused');
      } else {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          try {
            await playPromise;
            setIsPlaying(true);
            setError(null);
            console.log('[AudioPlayer] Playing');
          } catch (err) {
            console.error('[AudioPlayer] Playback failed:', err);
            setError(`Playback error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsPlaying(false);
          }
        } else {
          setIsPlaying(true);
          setError(null);
        }
      }
    } catch (err) {
      console.error('[AudioPlayer] Play/pause error:', err);
      setError(err instanceof Error ? err.message : 'Playback error');
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      console.log('[AudioPlayer] Audio loaded. Duration:', audioRef.current.duration);
      setDuration(audioRef.current.duration);
      setLoading(false);
      setError(null);
    }
  };

  const handleError = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget as HTMLAudioElement;
    const errorCode = audio.error?.code;
    let errorMsg = audio.error?.message || 'Failed to load audio';
    
    const errorCodeMap: { [key: number]: string } = {
      1: 'MEDIA_ERR_ABORTED: Loading was aborted',
      2: 'MEDIA_ERR_NETWORK: Network error',
      3: 'MEDIA_ERR_DECODE: Decode error (corrupted or unsupported format)',
      4: 'MEDIA_ERR_SRC_NOT_SUPPORTED: Source not supported'
    };
    
    if (errorCode && errorCodeMap[errorCode]) {
      errorMsg = errorCodeMap[errorCode];
    }
    
    console.error('[AudioPlayer] Audio error:', errorMsg, 'Code:', errorCode, 'Full error:', audio.error);
    console.error('[AudioPlayer] Audio URL:', audioUrl);
    console.error('[AudioPlayer] File extension:', getFileExtension());
    
    setError(errorMsg);
    setLoading(false);
    setIsPlaying(false);
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getFileName = (path: string) => {
    return path.split('/').pop() || path;
  };

  const currentIndex = allAudio.findIndex(a => a.id === audio.id);
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < allAudio.length - 1;

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${theme === 'dark' ? 'bg-black bg-opacity-50' : 'bg-black bg-opacity-40'}`}>
      {/* Audio Player Panel - Full height */}
      <div className={`flex-1 flex flex-col rounded-t-2xl shadow-2xl overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <h2 className={`text-lg font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {getFileName(audio.path)}
          </h2>
          <button
            onClick={onClose}
            className={`px-3 py-1 rounded text-sm font-medium transition ${
              theme === 'dark'
                ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            ✕
          </button>
        </div>

        {/* Main Content - Flex grow */}
        <div className="flex-1 flex flex-col px-6 py-8 space-y-6 overflow-y-auto">
          {/* Error/Info Message */}
          {error && (
            <div className={`p-3 rounded-lg text-sm ${
              theme === 'dark'
                ? 'bg-red-900 bg-opacity-30 border border-red-700 text-red-300'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {error}
            </div>
          )}

          {/* Format Conversion Info */}
          {isAifFormat() && loading && !error && (
            <div className={`p-3 rounded-lg text-sm ${
              theme === 'dark'
                ? 'bg-orange-900 bg-opacity-30 border border-orange-700 text-orange-300'
                : 'bg-orange-50 border border-orange-200 text-orange-700'
            }`}>
              ⏳ Converting AIF to WAV for playback... (this may take a moment for large files)
            </div>
          )}

          {/* Hidden Audio Element */}
          <audio
            ref={audioRef}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onError={handleError}
            crossOrigin="anonymous"
          />

          {/* Audio Visualizer - Full Size */}
          <AudioVisualizer 
            audioRef={audioRef as React.RefObject<HTMLAudioElement | null>} 
            isPlaying={isPlaying} 
            theme={theme}
            fullSize={true}
          />
        </div>

        {/* Bottom Controls Section - Fixed */}
        <div className={`px-6 py-8 space-y-6 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          {/* Progress Bar */}
          <div className="space-y-2">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleTimeChange}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-orange-500"
              style={{
                background: `linear-gradient(to right, #f97316 0%, #f97316 ${(currentTime / duration) * 100}%, ${theme === 'dark' ? '#374151' : '#e5e7eb'} ${(currentTime / duration) * 100}%, ${theme === 'dark' ? '#374151' : '#e5e7eb'} 100%)`
              }}
            />
            <div className="flex items-center justify-between text-xs">
              <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                {formatTime(currentTime)}
              </span>
              <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between gap-4">
            {/* Previous */}
            <button
              onClick={onPrevious}
              disabled={!canGoPrevious}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                canGoPrevious
                  ? theme === 'dark'
                    ? 'bg-gray-700 text-white hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                  : theme === 'dark'
                    ? 'bg-gray-700 text-gray-600 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              ⏮
            </button>

            {/* Play/Pause */}
            <button
              onClick={handlePlayPause}
              disabled={loading || error !== null}
              className={`px-6 py-3 rounded-lg font-medium text-white transition text-lg ${
                loading || error
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800'
              }`}
              title={loading ? 'Loading audio...' : error ? 'Error loading audio' : isPlaying ? 'Pause' : 'Play'}
            >
              {loading ? '⟳' : isPlaying ? '⏸' : '▶'}
            </button>

            {/* Next */}
            <button
              onClick={onNext}
              disabled={!canGoNext}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                canGoNext
                  ? theme === 'dark'
                    ? 'bg-gray-700 text-white hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                  : theme === 'dark'
                    ? 'bg-gray-700 text-gray-600 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              ⏭
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-4">
            <span className="text-lg">🔊</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-orange-500"
              style={{
                background: `linear-gradient(to right, #f97316 0%, #f97316 ${volume * 100}%, ${theme === 'dark' ? '#374151' : '#e5e7eb'} ${volume * 100}%, ${theme === 'dark' ? '#374151' : '#e5e7eb'} 100%)`
              }}
            />
            <span className={`text-sm font-medium w-8 text-right ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              {Math.round(volume * 100)}%
            </span>
          </div>

          {/* Now Playing Info */}
          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} text-xs text-center`}>
            <div className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              {currentIndex + 1} of {allAudio.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
