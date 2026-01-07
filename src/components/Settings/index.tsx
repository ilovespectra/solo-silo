'use client';
import { apiUrl } from '@/lib/api';

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSilos } from '@/hooks/useSilos';
import { useDemoMode } from '@/hooks/useDemoMode';
import { DatabaseManager } from '@/components/DatabaseManager';

interface MediaStats {
  total_files: number;
  by_type: Record<string, number>;
  total_size_bytes: number;
  with_people: number;
  with_animals: number;
}

interface IndexingProgress {
  is_indexing: boolean;
  current_file: string;
  processed: number;
  total: number;
  faces_found: number;
  animals_found: number;
  errors: number;
}

interface RetrainingProgress {
  is_running: boolean;
  progress: number;
  message: string;
  error: string | null;
  metrics: {
    model_version: number;
    training_samples: number;
    confirmed_people: number;
    cluster_count: number;
    embeddings_regenerated: number;
    avg_intra_cluster_distance: number;
    avg_inter_cluster_distance: number;
    timestamp: number;
  } | null;
  elapsed_time: number | null;
}

interface RetrainingLog {
  timestamp: number;
  progress: number;
  message: string;
}

export default function Settings() {
  const { theme, tourAutoOpenDebugLog, setTourAutoOpenDebugLog } = useAppStore();
  const { activeSilo } = useSilos();
  const { demoMode } = useDemoMode();
  const [stats, setStats] = useState<MediaStats | null>(null);
  const [indexingProgress, setIndexingProgress] = useState<IndexingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [reindexError, setReindexError] = useState<string | null>(null);
  const [shouldPollIndexing, setShouldPollIndexing] = useState(false);
  const [isRetraining, setIsRetraining] = useState(false);
  const [retrainingProgress, setRetrainingProgress] = useState<RetrainingProgress | null>(null);
  const [retrainingError, setRetrainingError] = useState<string | null>(null);
  const [retrainingLogs, setRetrainingLogs] = useState<RetrainingLog[]>([]);
  const [indexingLogs, setIndexingLogs] = useState<RetrainingLog[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [isFaceDetecting, setIsFaceDetecting] = useState(false);
  const [faceDetectionError, setFaceDetectionError] = useState<string | null>(null);
  const [faceDetectionLogs, setFaceDetectionLogs] = useState<RetrainingLog[]>([]);
  const [totalPhotoCount, setTotalPhotoCount] = useState<number | null>(null);
  const [isFacesCached, setIsFacesCached] = useState(false);
  const [shouldAutoStartFaceDetection, setShouldAutoStartFaceDetection] = useState(false);
  const [isClusteringFaces, setIsClusteringFaces] = useState(false);
  const [clusteringLogs, setClusteringLogs] = useState<RetrainingLog[]>([]);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const isIndexing = indexingProgress?.is_indexing || false;

  useEffect(() => {
    // Only load demo logs if in actual demo mode (not local deployment)
    if (!demoMode) {
      console.log('[Settings] Local mode - skipping demo logs');
      return;
    }
    
    const loadDemoLogs = async () => {
      try {
        console.log('[Settings] Loading demo logs on mount...');
        const response = await fetch('/api/logs/demo');
        console.log('[Settings] Demo logs response:', response.status, response.ok);
        
        if (response.ok) {
          const data = await response.json();
          console.log('[Settings] Demo logs received:', {
            hasIndexingLogs: !!data.indexingLogs,
            indexingCount: data.indexingLogs?.length || 0,
            hasFaceDetectionLogs: !!data.faceDetectionLogs,
            faceDetectionCount: data.faceDetectionLogs?.length || 0,
            hasClusteringLogs: !!data.clusteringLogs,
            clusteringCount: data.clusteringLogs?.length || 0
          });
          
          if (data.indexingLogs?.length > 0 || data.faceDetectionLogs?.length > 0 || data.clusteringLogs?.length > 0) {
            console.log('[Settings] Setting demo logs and opening debug terminal...');
            setIndexingLogs(data.indexingLogs || []);
            setFaceDetectionLogs(data.faceDetectionLogs || []);
            setClusteringLogs(data.clusteringLogs || []);
            setShowDebugLogs(true);
            console.log('[Settings] ✅ Demo logs loaded and debug terminal should be visible');
          } else {
            console.log('[Settings] No demo logs found in response');
          }
        } else {
          console.error('[Settings] Failed to load demo logs, status:', response.status);
        }
      } catch (error) {
        console.error('[Settings] Error loading demo logs:', error);
      }
    };
    
    loadDemoLogs();
  }, [demoMode]);

  useEffect(() => {
    const checkFaceDetectionStatus = async () => {
      try {
        const res = await fetch(apiUrl('/api/system/health-extended'));
        if (res.ok) {
          const health = await res.json();
          
          if (health.face_detection_running) {
            setIsFaceDetecting(true);
            setShowDebugLogs(true);
            
            try {
              const siloKey = activeSilo?.name ? `_${activeSilo.name}` : '';
              const savedLogs = localStorage.getItem(`faceDetectionLogs${siloKey}`);
              if (savedLogs) {
                setFaceDetectionLogs(JSON.parse(savedLogs));
              }
            } catch (e) {
              console.error('Failed to load saved logs:', e);
            }
            
            setFaceDetectionLogs(prev => [...prev, {
              timestamp: Date.now(),
              progress: 0,
              message: '📊 Resumed monitoring ongoing face detection scan...'
            }]);
          }
        }
      } catch (err) {
        console.error('Failed to check face detection status:', err);
      }
    };

    checkFaceDetectionStatus();
  }, []);

  useEffect(() => {
    if (isFaceDetecting) {
      setShowDebugLogs(true);
    }
  }, [isFaceDetecting]);

  useEffect(() => {
    if (isIndexing) {
      setShowDebugLogs(true);
    }
  }, [isIndexing]);

  useEffect(() => {
    try {
      const siloKey = activeSilo?.name ? `_${activeSilo.name}` : '';
      const savedFaceLogs = localStorage.getItem(`faceDetectionLogs${siloKey}`);
      const savedRetrainingLogs = localStorage.getItem(`retrainingLogs${siloKey}`);
      if (savedFaceLogs) {
        setFaceDetectionLogs(JSON.parse(savedFaceLogs));
      } else {
        setFaceDetectionLogs([]);
      }
      if (savedRetrainingLogs) {
        setRetrainingLogs(JSON.parse(savedRetrainingLogs));
      } else {
        setRetrainingLogs([]);
      }
      
      const facesCached = localStorage.getItem(`facesCached${siloKey}`) === 'true';
      setIsFacesCached(facesCached);
    } catch (e) {
      console.error('Failed to load logs from localStorage:', e);
    }
  }, [activeSilo?.name]);

  useEffect(() => {
    if (activeSilo?.name && faceDetectionLogs.length === 0 && retrainingLogs.length === 0) {
      const siloKey = `_${activeSilo.name}`;
      try {
        localStorage.removeItem(`faceDetectionLogs${siloKey}`);
        localStorage.removeItem(`retrainingLogs${siloKey}`);
        localStorage.removeItem(`facesCached${siloKey}`);
      } catch (e) {
        console.error('Failed to clear localStorage:', e);
      }
    }
  }, [activeSilo?.name]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'facesCached') {
        setIsFacesCached(e.newValue === 'true');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    try {
      const siloKey = activeSilo?.name ? `_${activeSilo.name}` : '';
      localStorage.setItem(`faceDetectionLogs${siloKey}`, JSON.stringify(faceDetectionLogs));
    } catch (e) {
      console.error('Failed to save face detection logs:', e);
    }
  }, [faceDetectionLogs, activeSilo?.name]);

  useEffect(() => {
    try {
      const siloKey = activeSilo?.name ? `_${activeSilo.name}` : '';
      localStorage.setItem(`retrainingLogs${siloKey}`, JSON.stringify(retrainingLogs));
    } catch (e) {
      console.error('Failed to save retraining logs:', e);
    }
  }, [retrainingLogs]);

  useEffect(() => {
    if (logsContainerRef.current && isAtBottomRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [retrainingLogs, faceDetectionLogs, indexingLogs, clusteringLogs]);

  const handleScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
      isAtBottomRef.current = scrollHeight - (scrollTop + clientHeight) < 10;
    }
  };
  useEffect(() => {
    const fetchData = async () => {
      try {
        const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
        const [statsRes, progressRes] = await Promise.all([
          fetch(`/api/media/stats${siloParam}`),
          fetch(`/api/indexing${siloParam}`),
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }

        if (progressRes.ok) {
          const progressData = await progressRes.json();
          setIndexingProgress(progressData.progress);
        }
      } catch (err) {
        console.error('failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [activeSilo?.name]);

  useEffect(() => {
    if (isIndexing && !showDebugLogs && !demoMode) {
      setShowDebugLogs(true);
      if (indexingLogs.length === 0) {
        setIndexingLogs([{
          timestamp: Date.now(),
          progress: 0,
          message: '📋 Starting indexing...'
        }]);
      }
    }
  }, [isIndexing, showDebugLogs, indexingLogs.length, demoMode]);

  useEffect(() => {
    if (tourAutoOpenDebugLog) {
      if (demoMode && (indexingLogs.length === 0 && faceDetectionLogs.length === 0 && clusteringLogs.length === 0)) {
        const timer = setTimeout(() => {
          setShowDebugLogs(true);
          setTourAutoOpenDebugLog(false);
        }, 300);
        return () => clearTimeout(timer);
      } else {
        setShowDebugLogs(true);
        setTourAutoOpenDebugLog(false);
      }
    }
  }, [tourAutoOpenDebugLog, setTourAutoOpenDebugLog, demoMode, indexingLogs.length, faceDetectionLogs.length, clusteringLogs.length]);

  useEffect(() => {
    const shouldPoll = shouldPollIndexing || isIndexing;
    if (!shouldPoll || demoMode) return;

    const fetchProgress = async () => {
      try {
        const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
        const res = await fetch(`/api/indexing${siloParam}`);
        if (res.ok) {
          const data = await res.json();
          
          if (data.progress) {
            const prog = data.progress;
            
            let message = '';
            
            if (prog.current_file && prog.current_file.includes('📊 Database:')) {
              // Always add database progress messages to logs
              const newLog: RetrainingLog = {
                timestamp: Date.now(),
                progress: prog.percentage || 0,
                message: prog.current_file
              };
              setIndexingLogs(prev => {
                // Replace the last log if it's also a database message (continuous update)
                if (prev.length > 0 && prev[prev.length - 1].message.includes('📊 Database:')) {
                  const updated = [...prev];
                  updated[updated.length - 1] = newLog;
                  return updated;
                }
                // Otherwise add as new log
                return [...prev, newLog];
              });
            }

            if (prog.current_file && prog.current_file !== '' && !prog.current_file.includes('📊 Database:')) {
              message = prog.current_file;
            }
            
            if (message && message !== '') {
              const newLog: RetrainingLog = {
                timestamp: Date.now(),
                progress: prog.percentage || 0,
                message: message
              };
              setIndexingLogs(prev => {
                if (prev.length > 0 && prev[prev.length - 1].message === newLog.message) {
                  return prev;
                }
                const updated = [...prev, newLog];
                return updated;
              });
            }
            
            setIndexingProgress(prog);
          }
          
          if (data.progress && data.progress.status === 'complete') {
            setIndexingLogs(prev => {
              const siloKey = activeSilo?.name ? `_${activeSilo.name}` : '';
              const updated = [...prev, {
                timestamp: Date.now(),
                progress: 100,
                message: '✅ Indexing complete! Starting face detection automatically...'
              }];
              try {
                localStorage.setItem(`indexingLogs${siloKey}`, JSON.stringify(updated));
              } catch (e) {
                console.error('Failed to save indexing logs:', e);
              }
              return updated;
            });
            setShouldPollIndexing(false);
            
            try {
              const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
              const statsRes = await fetch(`/api/media/stats${siloParam}`);
              if (statsRes.ok) {
                const statsData = await statsRes.json();
                setStats(statsData);
              }
            } catch (err) {
            }
            
            setTimeout(() => {
              setShouldAutoStartFaceDetection(true);
            }, 1000);
          }
        }
      } catch (err) {

      }
    };


    fetchProgress();
    const interval = setInterval(fetchProgress, 500);
    
    return () => {
      clearInterval(interval);
    };
  }, [shouldPollIndexing, isIndexing, activeSilo]);


  useEffect(() => {
    if (!shouldAutoStartFaceDetection) return;
    
    setShouldAutoStartFaceDetection(false);
    

    const performFaceDetection = async () => {
      setIsFaceDetecting(true);
      setFaceDetectionError(null);
      

      const siloKey = activeSilo?.name ? `_${activeSilo.name}` : '';
      const existingLogs = (() => {
        try {
          const saved = localStorage.getItem(`faceDetectionLogs${siloKey}`);
          return saved ? JSON.parse(saved) : [];
        } catch {
          return [];
        }
      })();
      
      setFaceDetectionLogs(existingLogs);
      setShowDebugLogs(true);
      
      const addLog = (message: string, progress: number) => {
        const newLog = {
          timestamp: Date.now(),
          progress,
          message
        };
        setFaceDetectionLogs(prev => {
          const updated = [...prev, newLog];
          try {
            localStorage.setItem(`faceDetectionLogs${siloKey}`, JSON.stringify(updated));
          } catch (e) {
            console.error('Failed to save log:', e);
          }
          return updated;
        });
      };
      
      try {
        addLog('🔄 Starting automatic face detection scan...', 0);
        
        const detectUrl = new URL('/api/indexing/detect-faces-only', window.location.origin);
        if (activeSilo?.name) {
          detectUrl.searchParams.append('silo_name', activeSilo.name);
        }
        
        const res = await fetch(detectUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || data.message || 'Failed to start face detection');
        }
        
        addLog('✓ Face detection started - monitoring progress...', 0);
      } catch (err: unknown) {
        setFaceDetectionError(err instanceof Error ? err.message : 'Failed to start face detection');
        addLog(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 0);
        setIsFaceDetecting(false);
      }
    };
    
    performFaceDetection();
  }, [shouldAutoStartFaceDetection, activeSilo?.name]);


  useEffect(() => {
    if (!isRetraining) return;

    const fetchProgress = async () => {
      try {
        const res = await fetch(apiUrl('/api/retraining/progress'));
        if (res.ok) {
          const data = await res.json();
          setRetrainingProgress(data);
          

          setRetrainingLogs(prev => [...prev, {
            timestamp: Date.now(),
            progress: data.progress,
            message: data.message
          }]);
          

          if (!data.is_running) {
            setIsRetraining(false);
            if (data.error) {
              setRetrainingError(data.error);
            }
          }
        }
      } catch (err) {
        console.error('failed to fetch retraining progress:', err);
      }
    };


    const interval = setInterval(fetchProgress, 500);
    return () => clearInterval(interval);
  }, [isRetraining]);


  const cumulativeCountRef = useRef(0);
  const cumulativeFacesRef = useRef(0);
  const [lastBatchTotal, setLastBatchTotal] = useState(0);

  useEffect(() => {
    if (!isFaceDetecting) return;

    const fetchProgress = async () => {
      try {
        const progressRes = await fetch(apiUrl('/api/indexing'));
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          const progress = progressData.progress || {};
          

          const batchProcessed = progress.processed || 0;
          const batchTotal = progress.total || 0;
          const batchFaces = progress.faces_found || 0;
          

          if (batchTotal > 0 && totalPhotoCount !== batchTotal) {
            setTotalPhotoCount(batchTotal);
          }
          

          if (batchTotal > 0 && lastBatchTotal > batchTotal && batchProcessed <= 1) {

            const justCompleted = lastBatchTotal - batchTotal;
            cumulativeCountRef.current += justCompleted;
            console.log(`🔄 Worker restarted - added ${justCompleted} files (cumulative now: ${cumulativeCountRef.current})`);

            if (faceDetectionError) {
              setFaceDetectionError(null);
              const actualTotal = batchTotal || 2146;
              setFaceDetectionLogs(prev => [...prev, {
                timestamp: Date.now(),
                progress: Math.round((cumulativeCountRef.current / actualTotal) * 100),
                message: `🔄 Process restarted automatically - resuming face detection...`
              }]);
            }

          }
          setLastBatchTotal(batchTotal);
          

          cumulativeFacesRef.current = batchFaces;
          

          const cumulativeProcessed = cumulativeCountRef.current + batchProcessed;
          const actualTotalPhotos = batchTotal || totalPhotoCount || 2146;
          const progressPercent = actualTotalPhotos > 0 ? Math.round((cumulativeProcessed / actualTotalPhotos) * 100) : 0;
          

          let logMsg = '';
          if (cumulativeProcessed > 0 || batchTotal > 0 || progress.status === 'running') {
            logMsg = `👤 face detection: ${cumulativeProcessed}/${actualTotalPhotos} photos • ✨ ${cumulativeFacesRef.current} faces found • ${progressPercent}% complete`;
            if (progress.current_file) {
              const filename = progress.current_file.split('/').pop() || 'Processing...';

              if (!filename.startsWith('📊') && !filename.startsWith('📁')) {
                logMsg += ` • ${filename}`;
              }
            }
          }
          

          if (progress.status === 'complete' || progress.status === 'error') {
            if (progress.status === 'error') {
              setFaceDetectionLogs(prev => [...prev, {
                timestamp: Date.now(),
                progress: 100,
                message: `❌ Error: ${progress.error || 'Unknown error'} - Process may auto-restart...`
              }]);
              setFaceDetectionError(progress.error || 'face detection failed');


            } else {
              const totalFaces = cumulativeFacesRef.current;
              setFaceDetectionLogs(prev => [...prev, {
                timestamp: Date.now(),
                progress: 100,
                message: `✅ face detection complete! Found ✨ ${totalFaces} faces in ${cumulativeProcessed} photos.`
              }]);
              

              setFaceDetectionLogs(prev => [...prev, {
                timestamp: Date.now(),
                progress: 100,
                message: `⚙️ Clustering faces automatically...`
              }]);
              

              try {
                await fetch(apiUrl('/api/cache/clear-face-clusters'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                });
              } catch (err) {

              }
              


              try {
                const clusterRes = await fetch(apiUrl('/api/faces/clusters?force_cluster=true'));
                if (clusterRes.ok) {
                  const clusters = await clusterRes.json();
                  const clusterCount = clusters.length;
                  setClusteringLogs([{
                    timestamp: Date.now(),
                    progress: 100,
                    message: `✅ Clustering complete! Generated ${clusterCount} person clusters.`
                  }]);
                }
              } catch (err) {
                setClusteringLogs([{
                  timestamp: Date.now(),
                  progress: 100,
                  message: `⚠️ Clustering completed (may be background)`
                }]);
              }
              

              try {
                const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
                const statsRes = await fetch(`/api/media/stats${siloParam}`);
                if (statsRes.ok) {
                  const statsData = await statsRes.json();
                  setStats(statsData);
                }
              } catch (err) {
                console.error('[Settings] Failed to refresh stats:', err);
              }
              

              setIsFaceDetecting(false);
              cumulativeCountRef.current = 0;
              cumulativeFacesRef.current = 0;
              setLastBatchTotal(0);
            }
          } else if (logMsg) {

            setFaceDetectionLogs(prev => {

              const lastLog = prev[prev.length - 1];
              if (lastLog && lastLog.message === logMsg) {
                return prev;
              }
              const updated = [...prev, {
                timestamp: Date.now(),
                progress: progressPercent,
                message: logMsg
              }];

              try {
                localStorage.setItem('faceDetectionLogs', JSON.stringify(updated));
              } catch (e) {
                console.error('Failed to save logs:', e);
              }
              return updated;
            });
          }
        }
      } catch (err) {
        console.error('failed to fetch face detection progress:', err);
      }
    };


    const interval = setInterval(fetchProgress, 1000);
    return () => clearInterval(interval);
  }, [isFaceDetecting, faceDetectionError, lastBatchTotal, totalPhotoCount]);


  const handleReindex = async () => {
    setReindexing(true);
    setShouldPollIndexing(true);
    setReindexError(null);
    

    const siloKey = activeSilo?.name ? `_${activeSilo.name}` : '';
    const existingLogs = (() => {
      try {
        const saved = localStorage.getItem(`indexingLogs${siloKey}`);
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    })();
    
    setIndexingLogs(existingLogs.length > 0 ? existingLogs : []);
    setShowDebugLogs(true);
    

    if (existingLogs.length === 0) {
      setIndexingLogs([
        {
          timestamp: Date.now(),
          progress: 0,
          message: '🔄 Initializing indexing... please wait for stats'
        }
      ]);
    }
    
    try {
      const url = new URL('/api/indexing/reindex-all', window.location.origin);
      if (activeSilo?.name) {
        url.searchParams.append('silo_name', activeSilo.name);
      }
      const res = await fetch(url.toString(), {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to start re-indexing');
      }
      setReindexing(false);
    } catch (err: unknown) {
      setReindexError(err instanceof Error ? err.message : 'Failed to start re-indexing');
      setIndexingLogs(prev => [...prev, {
        timestamp: Date.now(),
        progress: 0,
        message: `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      }]);
      setReindexing(false);
      setShouldPollIndexing(false);
    }
  };


  const handleRetrain = async () => {
    setIsRetraining(true);
    setRetrainingError(null);
    setRetrainingProgress(null);
    setRetrainingLogs([]);
    setShowDebugLogs(true);
    try {
      const res = await fetch(apiUrl('/api/retraining/full'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.message || 'Failed to start retraining');
      }

      const progressRes = await fetch(apiUrl('/api/retraining/progress'));
      if (progressRes.ok) {
        const initialData = await progressRes.json();
        setRetrainingProgress(initialData);
        setRetrainingLogs([{
          timestamp: Date.now(),
          progress: initialData.progress,
          message: initialData.message
        }]);
      }
    } catch (err: unknown) {
      setIsRetraining(false);
      setRetrainingError(err instanceof Error ? err.message : 'Failed to start retraining');
    }
  };

  const fetchDebugLogs = async (addLog: (msg: string, progress: number) => void) => {
    try {
      addLog('📋 Fetching backend debug logs...', 0);
      const response = await fetch(apiUrl('/api/debug/worker-logs'));
      if (!response.ok) {
        addLog(`❌ failed to fetch debug logs: ${response.status}`, 0);
        return;
      }
      
      const logs = await response.json();
      

      if (logs.worker_log) {
        addLog('📄 === WORKER LOG (LAST 500 LINES) ===', 0);
        const lines = logs.worker_log.split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            addLog(line, 0);
          }
        });
        addLog('📄 === END WORKER LOG ===', 0);
      }
      

      if (logs.crash_log) {
        addLog('🔴 === CRASH LOG ===', 0);
        const lines = logs.crash_log.split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            addLog(line, 0);
          }
        });
        addLog('🔴 === END CRASH LOG ===', 0);
      }
      

      if (logs.backend_log) {
        addLog('🖥️  === BACKEND LOG (LAST 100 LINES) ===', 0);
        const lines = logs.backend_log.split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            addLog(line, 0);
          }
        });
        addLog('🖥️  === END BACKEND LOG ===', 0);
      }
      

      if (logs.progress) {
        addLog(`📊 Last Progress: ${JSON.stringify(logs.progress)}`, 0);
      }
      

      if (logs.skipped) {
        addLog('⏭️  === SKIPPED IMAGES ===', 0);
        const lines = logs.skipped.split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            addLog(line, 0);
          }
        });
        addLog('⏭️  === END SKIPPED IMAGES ===', 0);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`❌ Error fetching debug logs: ${errMsg}`, 0);
    }
  };

  const handleFaceDetection = async () => {
    console.error('❌ [FACE] Scan for faces button clicked');
    setIsFaceDetecting(true);
    setFaceDetectionError(null);

    const siloKey = activeSilo?.name ? `_${activeSilo.name}` : '';
    const existingLogs = (() => {
      try {
        const saved = localStorage.getItem(`faceDetectionLogs${siloKey}`);
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    })();
    
    setFaceDetectionLogs(existingLogs);
    setShowDebugLogs(true);
    

    const addLog = (message: string, progress: number) => {
      const newLog = {
        timestamp: Date.now(),
        progress,
        message
      };
      
      console.error(`📋 [FACE] ${message}`);
      
      setFaceDetectionLogs(prev => {
        const updated = [...prev, newLog];

        try {
          localStorage.setItem(`faceDetectionLogs${siloKey}`, JSON.stringify(updated));
          console.log(`[LOG SAVED] ${message}`);
        } catch (e) {
          console.error('Failed to save log to localStorage:', e);
        }
        return updated;
      });
    };
    
    try {

      addLog('🔄 Starting face detection scan (face detection ONLY - NO RE-INDEXING)...', 0);
      addLog('Scanning all indexed photos for faces...', 0);
      
      const detectUrl = new URL('/api/indexing/detect-faces-only', window.location.origin);
      if (activeSilo?.name) {
        detectUrl.searchParams.append('silo_name', activeSilo.name);
        console.error('📋 [FACE] URL:', detectUrl.toString());
      }
      console.error('📋 [FACE] Sending POST to:', detectUrl.toString());
      const res = await fetch(detectUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      console.error('📋 [FACE] Response received, status:', res.status);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.message || 'Failed to start face detection');
      }
      
      addLog('✓ Scan started - monitoring progress...', 0);


      let isRunning = true;
      let lastLogCount = 0;
      let consecutiveErrors = 0;
      const startTime = Date.now();
      let lastLogTime = Date.now();
      let lastPhase = '';
      
      while (isRunning) {
        try {
          const progressRes = await fetch(apiUrl('/api/indexing'));
          if (progressRes.ok) {
            const progressData = await progressRes.json();
            const progress = progressData.progress || {};
            

            if (progress.phase && progress.phase !== lastPhase) {
              lastPhase = progress.phase;
              if (progress.phase === 'indexing') {
                addLog('📁 PHASE 1: Indexing - Scanning source folders for photos...', 0);
              } else if (progress.phase === 'detecting') {
                addLog('👤 PHASE 2: face detection - Scanning indexed photos for faces...', 0);
              }
            }
            

            const total = progress.total || 0;
            const processed = progress.processed || 0;
            const progressPercent = total > 0 ? Math.round((processed / total) * 100) : 0;
            

            const now = Date.now();
            if (processed > lastLogCount || (now - lastLogTime) > 5000) {
              let logMsg = '';
              const displayProgress = progressPercent;
              
              if (progress.phase === 'indexing') {
                logMsg = `📁 Indexing: ${processed}/${total} photos scanned • ${progressPercent}% complete`;
                if (progress.current_file) {
                  logMsg += ` • ${progress.current_file.split('/').pop() || 'Scanning...'}`;
                }
              } else {
                logMsg = `face detection: ${processed}/${total} photos • ${progressPercent}% complete`;
                if (progress.current_file) {
                  logMsg += ` • ${progress.current_file.split('/').pop() || 'processing...'}`;
                }
              }
              
              addLog(logMsg, displayProgress);
              lastLogCount = processed;
              lastLogTime = now;
            }
            
            consecutiveErrors = 0;
            

            const isComplete = progress.status === 'complete' || progress.status === 'error';
            if (isComplete) {
              isRunning = false;
              const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
              const facesFound = progress.faces_found || 0;
              
              if (progress.status === 'error') {
                addLog(
                  `❌ Workflow failed: ${progress.error || 'Unknown error'}`,
                  100
                );
                setFaceDetectionError(progress.error || 'Workflow failed');
              } else {
                addLog(
                  `✅ Face detection complete! Found ${facesFound} faces in ${processed} photos. Elapsed: ${elapsedSeconds}s`,
                  100
                );
                

                addLog(`🔄 Starting automatic face clustering...`, 100);
                try {
                  const clusterUrl = new URL('/api/faces/recluster', window.location.origin);
                  console.error('📋 [CLUSTER-AUTO] Sending POST to:', clusterUrl.toString());
                  const clusterRes = await fetch(clusterUrl.toString(), {
                    method: 'POST',
                  });
                  console.error('📋 [CLUSTER-AUTO] Response status:', clusterRes.status);
                  if (clusterRes.ok) {
                    const clusterData = await clusterRes.json();
                    addLog(`✅ Clustering complete! Found ${clusterData.cluster_count || 'multiple'} people clusters.`, 100);
                    console.error('✅ [CLUSTER-AUTO] Clustering initiated successfully');
                  } else {
                    addLog(`⚠️ Clustering initiated...`, 100);
                  }
                } catch (clusterErr) {
                  console.error('❌ [CLUSTER-AUTO] Error:', clusterErr);
                  addLog(`⚠️ Clustering initiated (status unknown)`, 100);
                }
              }
            }
          }
        } catch (err) {
          consecutiveErrors++;
          console.error('Error polling progress:', err);
          

          if (consecutiveErrors >= 3) {
            addLog(`⚠️ Backend connection lost - checking status...`, 0);
            

            try {
              const healthRes = await fetch(apiUrl('/api/system/health-extended')).catch(() => null);
              if (healthRes && healthRes.ok) {
                const health = await healthRes.json();
                if (health.has_crash_logs && health.recent_crash) {
                  addLog(
                    `🔴 Backend crash detected: ${health.recent_crash.substring(0, 100)}...`,
                    0
                  );
                  setFaceDetectionError('Backend crashed - attempting recovery...');
                  

                  addLog('🔍 Fetching detailed crash diagnostics...', 0);
                  await fetchDebugLogs(addLog);
                }
              }
            } catch (e) {

              console.error('Health check failed:', e);
            }
            
            addLog(`❌ Backend unreachable. Logs have been saved locally.`, 0);
            setFaceDetectionError(err instanceof Error ? err.message : 'Backend connection error');
            isRunning = false;
          } else {
            addLog(`⚠️ Connection issue (${consecutiveErrors}/3) - retrying...`, 0);
          }
        }
        
        if (isRunning) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setIsFaceDetecting(false);
      setFaceDetectionError(errMsg);
      addLog(`❌ Error: ${errMsg}`, 0);
    } finally {
      setIsFaceDetecting(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex-1 bg-secondary p-8 overflow-auto">
        <div className="text-center">
          <div className="text-lg font-semibold text-primary">
            loading statistics...
          </div>
        </div>
      </div>
    );
  }

  const progressPercent =
    indexingProgress && indexingProgress.total > 0
      ? Math.round((indexingProgress.processed / indexingProgress.total) * 100)
      : 0;


  return (
    <div className="flex-1 flex flex-col bg-secondary">
      <div className="flex-1 overflow-y-auto p-8">
        <div 
  className="overflow-y-auto"
  style={{
    height: `calc(100vh - ${theme === 'dark' ? '208px' : '200px'})`
  }}
>
          <h1 className="text-3xl font-bold mb-8 text-primary">
            statistics
          </h1>
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <button
            onClick={handleReindex}
            disabled={reindexing || isIndexing}
            className={`px-6 py-2 rounded-lg font-semibold transition text-white ${
              reindexing || isIndexing
                ? 'bg-tertiary cursor-not-allowed'
                : 'bg-orange-primary hover:bg-orange-secondary'
            }`}
            style={{
              background: reindexing || isIndexing ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, var(--orange-primary), var(--orange-secondary))',
            }}
          >
            {reindexing ? 'starting...' : isIndexing ? 'indexing...' : 'index all'}
          </button>
          <div className="relative group">
            <button
              onClick={handleRetrain}
              disabled={isRetraining || !isFacesCached}
              className={`px-6 py-2 rounded-lg font-semibold transition text-primary ${
                isRetraining || !isFacesCached
                  ? 'bg-tertiary cursor-not-allowed'
                  : 'bg-green-primary hover:bg-green-secondary'
              }`}
              style={{
                background: isRetraining || !isFacesCached ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, var(--green-primary), var(--green-secondary))',
                color: isRetraining || !isFacesCached ? 'var(--text-muted)' : '#000000'
              }}
            >
              {isRetraining ? `retraining... ${retrainingProgress?.progress || 0}%` : 'refine models'}
            </button>
            {!isFacesCached && !isRetraining && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                cache faces to refine models
              </div>
            )}
          </div>

          {reindexError && <span className="text-red-600 text-sm" style={{ color: 'var(--orange-primary)' }}>{reindexError}</span>}
          {retrainingError && <span className="text-red-600 text-sm" style={{ color: 'var(--orange-primary)' }}>{retrainingError}</span>}
          {faceDetectionError && <span className="text-red-600 text-sm" style={{ color: 'var(--orange-primary)' }}>{faceDetectionError}</span>}
        </div>
        {isRetraining && retrainingProgress && (
          <div
            className="mb-8 p-6 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-primary)'
            }}
          >
            <div className="flex items-center gap-3 mb-4 text-secondary">
              <div className="w-3 h-3 rounded-full bg-green-primary animate-pulse"></div>
              <span className="font-semibold">model retraining in progress...</span>
            </div>

            <div className="text-sm mb-4 text-secondary">
              {retrainingProgress.message}
            </div>
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-secondary">
                  progress
                </span>
                <span className="text-sm text-secondary">
                  {retrainingProgress.progress}%
                  {retrainingProgress.elapsed_time && (
                    <> • {Math.round(retrainingProgress.elapsed_time)}s elapsed</>
                  )}
                </span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <div
                  className="h-full transition-all duration-300"
                  style={{ 
                    background: 'linear-gradient(90deg, var(--green-primary), var(--green-secondary))',
                    width: `${retrainingProgress.progress}%`,
                    boxShadow: 'var(--glow-green)'
                  }}
                ></div>
              </div>
            </div>

            {retrainingProgress.metrics && (
              <div className="text-xs text-secondary">
                <div>model version: {retrainingProgress.metrics.model_version}</div>
                <div>training samples: {retrainingProgress.metrics.training_samples}</div>
                <div>confirmed people: {retrainingProgress.metrics.confirmed_people}</div>
                <div>embeddings regenerated: {retrainingProgress.metrics.embeddings_regenerated}</div>
              </div>
            )}
          </div>
        )}
        {isFaceDetecting && faceDetectionLogs.length > 0 && (
          <div
            className="mb-8 p-6 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-primary)'
            }}
          >
            <div className="flex items-center gap-3 mb-4 text-secondary">
              <div className="w-3 h-3 rounded-full bg-orange-primary animate-pulse"></div>
              <span className="font-semibold">scanning for faces...</span>
            </div>

            {faceDetectionLogs.length > 0 && (
              <div className="mb-4">
                <div className="text-sm mb-2 text-secondary">
                  {faceDetectionLogs[faceDetectionLogs.length - 1].message}
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <div
                    className="h-full transition-all duration-300"
                    style={{ 
                      background: 'linear-gradient(90deg, var(--orange-primary), var(--orange-secondary))',
                      width: `${faceDetectionLogs[faceDetectionLogs.length - 1]?.progress || 0}%`,
                      boxShadow: 'var(--glow-orange)'
                    }}
                  ></div>
                </div>
                {(() => {
                  const lastMsg = faceDetectionLogs[faceDetectionLogs.length - 1].message;
                  const faceMatch = lastMsg.match(/Total: (\d+) faces?/);
                  const photoMatch = lastMsg.match(/(\d+)\/(\d+) photos?/);
                  
                  return (
                    <div className="text-xs mt-3 pt-3 border-t text-secondary" style={{ borderColor: 'var(--border-primary)' }}>
                      {faceMatch && (
                        <div className="mb-1">
                          <strong>✨ Faces Detected: {faceMatch[1]}</strong>
                        </div>
                      )}
                      {photoMatch && (
                        <div>
                          📊 photos scanned: {photoMatch[1]}/{photoMatch[2]}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
        {(showDebugLogs && (retrainingLogs.length > 0 || faceDetectionLogs.length > 0 || indexingLogs.length > 0 || clusteringLogs.length > 0)) && (
          <div
            className={`mb-8 p-6 rounded-lg border ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-gray-50 border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {isIndexing ? '📁 indexing progress' : isFaceDetecting ? '👤 face detection progress' : clusteringLogs.length > 0 ? '⚙️ clustering progress' : '📊 processing debug log'}
              </h3>
              <button
                onClick={() => setShowDebugLogs(false)}
                className={`text-sm px-3 py-1 rounded ${
                  theme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                }`}
              >
                hide
              </button>
            </div>
            {(() => {

              const indexingCount = indexingProgress?.processed || 0;
              const faceDetectionCount = indexingProgress?.faces_found || 0;
              const clusteringCount = 0;
              const retrainingCount = 0;
              const total = indexingCount + faceDetectionCount + clusteringCount + retrainingCount;
              
              return (
                <div className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                  {total} updates recorded ({indexingCount} indexing, {faceDetectionCount} face detection, {clusteringCount} clustering, {retrainingCount} retraining)
                </div>
              );
            })()}
            <div className={`overflow-x-auto rounded-lg border lowercase ${
              theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
            } h-96 overflow-y-auto`} ref={logsContainerRef} onScroll={handleScroll}>
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className={theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}>
                    <th className={`px-3 py-2 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Time
                    </th>
                    <th className={`px-3 py-2 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Progress
                    </th>
                    <th className={`px-3 py-2 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody className={theme === 'dark' ? 'divide-y divide-gray-700' : 'divide-y divide-gray-300'}>
                  {(() => {
                    const allLogs = [
                      ...indexingLogs,
                      ...faceDetectionLogs,
                      ...clusteringLogs,
                      ...retrainingLogs
                    ].sort((a, b) => a.timestamp - b.timestamp);
                    
                    return allLogs.map((log, idx) => (
                      <tr
                        key={idx}
                        className={theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}
                      >
                        <td className={`px-3 py-2 text-xs whitespace-nowrap ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          {new Date(log.timestamp).toLocaleTimeString('en-US', { 
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          fractionalSecondDigits: 3
                        })}
                      </td>
                      <td className={`px-3 py-2 text-xs font-medium ${
                        theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-12 h-6 rounded bg-gray-300 overflow-hidden ${
                            theme === 'dark' ? 'bg-gray-600' : ''
                          }`}>
                            <div
                              className="h-full bg-orange-500"
                              style={{ width: `${log.progress}%` }}
                            ></div>
                          </div>
                          <span>{log.progress}%</span>
                        </div>
                      </td>
                      <td className={`px-3 py-2 text-xs ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {log.message}
                      </td>
                    </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 lowercase">
              <div>
                <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  first update
                </div>
                <div className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {(() => {
                    const logs = isIndexing ? indexingLogs : isFaceDetecting ? faceDetectionLogs : retrainingLogs;
                    return logs.length > 0 ? new Date(logs[0].timestamp).toLocaleTimeString() : 'N/A';
                  })()}
                </div>
              </div>
              <div>
                <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  last update
                </div>
                <div className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {(() => {
                    const logs = isIndexing ? indexingLogs : isFaceDetecting ? faceDetectionLogs : retrainingLogs;
                    return logs.length > 0 ? new Date(logs[logs.length - 1].timestamp).toLocaleTimeString() : 'N/A';
                  })()}
                </div>
              </div>
              <div>
                <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  latest progress
                </div>
                <div className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {(() => {
                    const logs = isIndexing ? indexingLogs : isFaceDetecting ? faceDetectionLogs : retrainingLogs;
                    return logs.length > 0 ? `${logs[logs.length - 1].progress}%` : 'N/A';
                  })()}
                </div>
              </div>
              <div>
                <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  elapsed time
                </div>
                <div className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {(() => {
                    const logs = isIndexing ? indexingLogs : isFaceDetecting ? faceDetectionLogs : retrainingLogs;
                    return logs.length > 1
                      ? `${Math.round((logs[logs.length - 1].timestamp - logs[0].timestamp) / 1000)}s`
                      : 'N/A';
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}
        {isIndexing && (
          <div
            className={`mb-8 p-6 rounded-lg border ${
              theme === 'dark'
                ? 'bg-orange-900 border-orange-700'
                : 'bg-orange-50 border-orange-200'
            }`}
          >
            <div className={`flex items-center gap-3 mb-4 ${theme === 'dark' ? 'text-orange-100' : 'text-orange-800'}`}>
              <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse"></div>
              <span className="font-semibold">⏳ indexing in progress...</span>
            </div>

            <div className={`text-sm mb-4 ${theme === 'dark' ? 'text-orange-200' : 'text-orange-700'}`}>
              {indexingProgress?.current_file && (
                <div className="truncate">processing: {indexingProgress.current_file}</div>
              )}
            </div>
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-orange-100' : 'text-orange-900'}`}>
                  progress
                </span>
                <span className={`text-sm ${theme === 'dark' ? 'text-orange-200' : 'text-orange-700'}`}>
                  {indexingProgress?.processed || 0} / {indexingProgress?.total || 0} files ({progressPercent}%)
                </span>
              </div>
              <div className={`w-full h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-orange-800' : 'bg-orange-200'}`}>
                <div
                  className="h-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            <div className={`text-xs ${theme === 'dark' ? 'text-orange-200' : 'text-orange-600'}`}>
              files may not be searchable until indexing completes. you can browse and view files now.
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 lowercase">
          <div
            className={`p-6 rounded-lg border ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200'
            } shadow-sm`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">📁</span>
              <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                total files
              </h3>
            </div>
            <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {stats?.total_files || 0}
            </div>
          </div>
          <div
            className={`p-6 rounded-lg border ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200'
            } shadow-sm`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">💾</span>
              <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                total size
              </h3>
            </div>
            <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {formatBytes(stats?.total_size_bytes || 0)}
            </div>
          </div>
          <div
            className={`p-6 rounded-lg border ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200'
            } shadow-sm`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">👥</span>
              <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                with people
              </h3>
            </div>
            <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {stats?.with_people || 0}
            </div>
            {stats?.total_files && stats.total_files > 0 && (
              <div className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {Math.round(((stats.with_people || 0) / stats.total_files) * 100)}% of all files
              </div>
            )}
          </div>
          <div
            className={`p-6 rounded-lg border ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200'
            } shadow-sm`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🐾</span>
              <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                with animals
              </h3>
            </div>
            <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {stats?.with_animals || 0}
            </div>
            {stats?.total_files && stats.total_files > 0 && (
              <div className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {Math.round(((stats.with_animals || 0) / stats.total_files) * 100)}% of all files
              </div>
            )}
          </div>
        </div>
        {stats?.by_type && Object.keys(stats.by_type).length > 0 && (
          <div
            className={`p-6 rounded-lg border lowercase ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200'
            } shadow-sm mb-8`}
          >
            <h3 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              file types
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(stats.by_type).map(([type, count]) => (
                <div
                  key={type}
                  className={`p-4 rounded ${
                    theme === 'dark'
                      ? 'bg-gray-700'
                      : 'bg-gray-100'
                  }`}
                >
                  <div className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                    {type.toUpperCase()}
                  </div>
                  <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {count}
                  </div>
                  {stats.total_files && stats.total_files > 0 && (
                    <div className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      {Math.round((count / stats.total_files) * 100)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {isIndexing && indexingProgress && (
          <div
            className={`p-6 rounded-lg border ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200'
            } shadow-sm`}
          >
            <h3 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              detection progress
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                  faces found
                </div>
                <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {indexingProgress.faces_found || 0}
                </div>
              </div>
              <div>
                <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                  animals found
                </div>
                <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {indexingProgress.animals_found || 0}
                </div>
              </div>
            </div>
            {indexingProgress.errors > 0 && (
              <div className={`mt-4 text-sm ${theme === 'dark' ? 'text-red-300' : 'text-red-600'}`}>
                ⚠️ {indexingProgress.errors} errors during processing
              </div>
            )}
          </div>
        )}
        <div className="mt-8">
          <h2 className={`text-2xl font-bold mb-6 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            database management
          </h2>
          <DatabaseManager />
        </div>
        </div>
      </div>
    </div>
  );
}
