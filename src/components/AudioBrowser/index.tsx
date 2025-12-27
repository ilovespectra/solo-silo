'use client';

import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSilos } from '@/hooks/useSilos';
import AudioPlayer from '@/components/AudioModal/AudioPlayer';
import { getCachedAudio, cacheAudio, clearAudioCache } from '@/lib/audioCache';

interface AudioItem {
  id: number;
  path: string;
  type: string;
  date_taken?: number;
  size?: number;
}

interface DateGroup {
  date_taken: number | null;
  items: AudioItem[];
}

interface IndexingProgress {
  status: string;
  processed: number;
  total: number;
  percentage: number;
  current_file?: string;
  message?: string;
  phase?: string;
}

type ViewMode = 'grid' | 'list';
type SortField = 'date' | 'name' | 'size';
type SortOrder = 'asc' | 'desc';

export default function AudioBrowser() {
  const { activeSilo } = useSilos();
  const [groups, setGroups] = useState<DateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedAudioId, setSelectedAudioId] = useState<number | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<AudioItem | null>(null);
  const [indexingProgress, setIndexingProgress] = useState<IndexingProgress | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { theme } = useAppStore();

  useEffect(() => {
    const fetchAudio = async () => {
      try {
        setLoading(true);
        
        const cachedData = getCachedAudio(activeSilo?.name);
        if (cachedData) {
          console.log('[AudioBrowser] Loading from cache');
          processAudioData(cachedData);
          return;
        }

        console.log('[AudioBrowser] Fetching audio from /api/media/audio');
        const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
        const response = await fetch(`/api/media/audio${siloParam}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('[AudioBrowser] received audio data:', data);
        console.log('[AudioBrowser] total audio files:', data.length);
        
        cacheAudio(data, activeSilo?.name);
        
        processAudioData(data);
      } catch (err) {
        console.error('[AudioBrowser] error fetching audio:', err);
        setError(err instanceof Error ? err.message : 'failed to fetch audio');
      } finally {
        setLoading(false);
      }
    };

    const processAudioData = (data: AudioItem[]) => {
      const grouped: { [key: string]: AudioItem[] } = {};
      
      data.forEach((item: AudioItem) => {
        const date = item.date_taken || null;
        const key = date ? new Date(date * 1000).toLocaleDateString() : 'no date';
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(item);
      });

      const audioGroups: DateGroup[] = Object.entries(grouped).map(([, items]) => ({
        date_taken: items[0]?.date_taken || null,
        items,
      }));

      audioGroups.sort((a, b) => {
        const aDate = a.date_taken || 0;
        const bDate = b.date_taken || 0;
        return sortOrder === 'desc' ? bDate - aDate : aDate - bDate;
      });

      console.log('[AudioBrowser] grouped into', audioGroups.length, 'date groups');
      setGroups(audioGroups);
    };

    fetchAudio();
  }, [sortField, sortOrder]);

  useEffect(() => {
    const pollIndexingProgress = async () => {
      try {
        const response = await fetch('/api/indexing');
        if (!response.ok) return;
        const data = await response.json();
        
        if (data.progress && (data.progress.status === 'running' || data.progress.phase === 'indexing')) {
          const currentFile = data.progress.current_file || '';
          const audioExtensions = ['.aif', '.aiff', '.wav', '.mp3', '.flac', '.aac', '.m4a', '.ogg', '.wma', '.opus', '.alac'];
          const isAudioFile = audioExtensions.some(ext => currentFile.toLowerCase().includes(ext));
          
          if (isAudioFile) {
            setIndexingProgress(data.progress);
            console.log('[AudioBrowser] processing audio file:', currentFile);
          } else {
            setIndexingProgress(null);
          }
        } else if (data.progress.status === 'complete') {
          setIndexingProgress(null);
          clearAudioCache(activeSilo?.name);
          setLoading(true);
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      } catch {
      }
    };

    pollingIntervalRef.current = setInterval(pollIndexingProgress, 500);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const handleAudioClick = (audio: AudioItem) => {
    setSelectedAudioId(audio.id);
    setSelectedAudio(audio);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getFileName = (path: string) => {
    return path.split('/').pop() || path;
  };

  const getFileExtension = (path: string) => {
    const ext = path.split('.').pop()?.toUpperCase() || 'AUDIO';
    return ext.substring(0, 3);
  };

  if (loading || indexingProgress) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center space-y-6 max-w-md lowercase">
          {indexingProgress ? (
            <>
              <div className="space-y-3">
                <h3 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  processing audio files
                </h3>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {indexingProgress.phase === 'detecting' ? 'detecting faces...' : 'converting & indexing...'}
                </p>
              </div>
              
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className={`w-full h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <div
                    className="h-full bg-orange-500 transition-all duration-300"
                    style={{ width: `${indexingProgress.percentage}%` }}
                  />
                </div>
                <div className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  {indexingProgress.processed} / {indexingProgress.total} files
                </div>
                <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {indexingProgress.percentage}% complete
                </div>
              </div>
              
              {/* Current File */}
              {indexingProgress.current_file && (
                <div className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'} truncate`}>
                  🎵 processing: {indexingProgress.current_file.split('/').pop()}
                </div>
              )}
            </>
          ) : (
            <>
              <div className={`text-lg ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                loading audio files...
              </div>
              <div className={`w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto ${theme === 'dark' ? 'border-gray-700' : ''}`} />
            </>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={`text-center ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
          <p className="font-semibold mb-2">error loading audio</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className={`w-full h-full flex items-center justify-center flex-col gap-4 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={`text-6xl`}>🎵</div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full flex flex-col ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header Controls */}
      <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4 flex items-center justify-between gap-4`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">view:</span>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded text-xs font-medium transition ${
              viewMode === 'list'
                ? theme === 'dark'
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-100 text-orange-700'
                : theme === 'dark'
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            list
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 rounded text-xs font-medium transition ${
              viewMode === 'grid'
                ? theme === 'dark'
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-100 text-orange-700'
                : theme === 'dark'
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            grid
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">sort:</span>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className={`px-3 py-1 rounded text-xs font-medium transition border ${
              theme === 'dark'
                ? 'bg-gray-700 border-gray-600 text-gray-300'
                : 'bg-white border-gray-300 text-gray-700'
            }`}
          >
            <option value="date">date</option>
            <option value="name">name</option>
            <option value="size">size</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className={`px-2 py-1 rounded text-xs font-medium transition ${
              theme === 'dark'
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Audio List/Grid */}
      <div className={`flex-1 overflow-y-auto`}>
        {viewMode === 'list' ? (
          <div className="divide-y" style={{ borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}>
            {groups.map((group) => (
              <div key={group.date_taken}>
                <div className={`px-6 py-3 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'} font-semibold text-xs uppercase tracking-wide`}>
                  {group.date_taken ? new Date(group.date_taken * 1000).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }) : 'no date'}
                </div>
                <div className="divide-y" style={{ borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}>
                  {group.items.map((audio) => (
                    <div
                      key={audio.id}
                      onClick={() => handleAudioClick(audio)}
                      className={`px-6 py-4 cursor-pointer transition ${
                        selectedAudioId === audio.id
                          ? theme === 'dark'
                            ? 'bg-orange-900 bg-opacity-40'
                            : 'bg-orange-50'
                          : theme === 'dark'
                            ? 'bg-gray-800 hover:bg-gray-700'
                            : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded flex items-center justify-center text-lg font-semibold ${
                          theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                        }`}>
                          🎵
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            {getFileName(audio.path)}
                          </div>
                          <div className={`text-xs truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            {formatFileSize(audio.size)} • {getFileExtension(audio.path)}
                          </div>
                        </div>
                        <div className={`text-xs whitespace-nowrap ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                          {audio.date_taken ? new Date(audio.date_taken * 1000).toLocaleDateString() : '—'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {groups.map((group) =>
                group.items.map((audio) => (
                  <div
                    key={audio.id}
                    onClick={() => handleAudioClick(audio)}
                    className={`rounded-lg p-4 cursor-pointer transition ${
                      selectedAudioId === audio.id
                        ? theme === 'dark'
                          ? 'bg-orange-900 bg-opacity-40 border-2 border-orange-600'
                          : 'bg-orange-50 border-2 border-orange-400'
                        : theme === 'dark'
                          ? 'bg-gray-800 hover:bg-gray-700'
                          : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    <div className={`text-4xl mb-2`}>🎵</div>
                    <div className={`text-xs font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {getFileName(audio.path)}
                    </div>
                    <div className={`text-xs truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {formatFileSize(audio.size)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Audio Player Modal */}
      {selectedAudio && (
        <AudioPlayer
          audio={selectedAudio}
          allAudio={groups.flatMap(g => g.items)}
          onClose={() => {
            setSelectedAudioId(null);
            setSelectedAudio(null);
          }}
          onNext={() => {
            const allAudio = groups.flatMap(g => g.items);
            const currentIndex = allAudio.findIndex(a => a.id === selectedAudio.id);
            if (currentIndex < allAudio.length - 1) {
              const next = allAudio[currentIndex + 1];
              setSelectedAudioId(next.id);
              setSelectedAudio(next);
            }
          }}
          onPrevious={() => {
            const allAudio = groups.flatMap(g => g.items);
            const currentIndex = allAudio.findIndex(a => a.id === selectedAudio.id);
            if (currentIndex > 0) {
              const prev = allAudio[currentIndex - 1];
              setSelectedAudioId(prev.id);
              setSelectedAudio(prev);
            }
          }}
        />
      )}
    </div>
  );
}
