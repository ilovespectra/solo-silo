import { apiUrl } from '@/lib/api';
'use client';

import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSilos } from '@/hooks/useSilos';
import { Permissions } from '@/types';
import FolderPicker from '@/components/FolderPicker';

const ESTIMATED_TIME_PER_IMAGE_MS = 2500;

export default function SetupWizard() {
  const {
    config,
    updatePermissions,
    addSelectedPath,
    removeSelectedPath,
    setShowSetupWizard,
    setIndexingComplete,
    setActiveSiloName,
  } = useAppStore();
  const { activeSilo } = useSilos();

  const theme = useAppStore((state) => state.theme) as 'light' | 'dark';

  const [currentStep, setCurrentStep] = useState(0);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [tempPermissions, setTempPermissions] = useState<Permissions>(
    config.permissions
  );
  const [trainingStatus, setTrainingStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState<{ percentage: number; processed: number; total: number; currentFile?: string; status?: string; error?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'starting' | 'running' | 'failed'>('checking');
  const [newFilesDetected, setNewFilesDetected] = useState<number>(0);
  const [isCheckingForNewFiles, setIsCheckingForNewFiles] = useState(false);
  const [backendStartTime, setBackendStartTime] = useState<number | null>(null);
  const [backendProgress, setBackendProgress] = useState<number>(0);
  const [backendLogs, setBackendLogs] = useState<string[]>([]);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

  const steps = [
    { title: 'source', id: 'source' },
    { title: 'select paths', id: 'paths' },
    { title: 'grant permissions', id: 'permissions' },
    { title: 'index', id: 'train' },
    { title: 'review', id: 'review' },
  ];

  const permissionDescriptions: Record<keyof Permissions, { label: string; description: string }> = {
    readFiles: {
      label: 'read files',
      description: 'access file contents for indexing and searching',
    },
    listDirectories: {
      label: 'list directories',
      description: 'browse and view folder contents',
    },
    indexContent: {
      label: 'index content',
      description: 'create searchable index of files (required for search)',
    },
    recognizeFaces: {
      label: 'recognize faces',
      description: 'detect and cluster faces in photos',
    },
    analyzeImages: {
      label: 'analyze images',
      description: 'extract descriptions from images',
    },
    searchText: {
      label: 'search text',
      description: 'perform semantic search across files',
    },
    moveFiles: {
      label: 'move files',
      description: 'move files between folders',
    },
    deleteFiles: {
      label: 'delete files',
      description: 'permanently delete files',
    },
    renameFiles: {
      label: 'rename files',
      description: 'change file and folder names',
    },
    createFolders: {
      label: 'create folders',
      description: 'create new directories',
    },
    modifyMetadata: {
      label: 'modify metadata',
      description: 'change file tags and metadata',
    },
  };

  const handlePermissionToggle = (key: keyof Permissions) => {
    setTempPermissions({
      ...tempPermissions,
      [key]: !tempPermissions[key],
    });
  };

  const handleComplete = () => {
    updatePermissions(tempPermissions);
    setShowSetupWizard(false);
  };


  const checkBackendHealth = async (): Promise<boolean> => {
    try {
      const healthRes = await fetch(`${API_BASE}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      return healthRes.ok;
    } catch {
      return false;
    }
  };


  useEffect(() => {
    setBackendStatus('checking');
    setBackendLogs([]);
    setBackendProgress(0);
    setBackendStartTime(null);
  }, []);


  useEffect(() => {
    if (activeSilo?.name) {
      console.log(`[SetupWizard] Syncing appStore to active silo: ${activeSilo.name}`);
      setActiveSiloName(activeSilo.name);
    }
  }, [activeSilo?.name, setActiveSiloName]);

  const retryBackendCheck = () => {
    setBackendStatus('checking');
    setBackendLogs([]);
    setBackendProgress(0);
    setBackendStartTime(null);
  };

  useEffect(() => {

    let retryCount = 0;
    const maxRetries = 60;
    let startTime: number | null = null;
    
    const ensureBackend = async () => {
      if (retryCount >= maxRetries) {
        setBackendStatus('failed');
        setBackendLogs(prev => [...prev, '❌ Backend startup timed out after 2 minutes']);
        return;
      }

      try {

        if (retryCount === 0) {
          try {
            const healthRes = await fetch(`${API_BASE}/health`, { 
              method: 'GET',
              signal: AbortSignal.timeout(2000)
            });
            if (healthRes.ok) {
              console.log('Backend is already running!');
              setBackendProgress(100);
              setBackendLogs(['✓ Backend detected and running']);
              setBackendStatus('running');
              

              if (currentStep === 0) {
                await new Promise(r => setTimeout(r, 500));
                checkForNewFiles();
              }
              return;
            }
          } catch {

            console.log('Health check failed, attempting to start backend...');
          }
        }


        if (backendStartTime === null) {
          startTime = Date.now();
          setBackendStartTime(startTime);
        }

        const res = await fetch(apiUrl('/api/system/backend/start'), { method: 'POST' });
        

        if (res.status === 404) {
          console.log('Backend start endpoint not found - checking if backend is already running...');
          const healthCheck = await checkBackendHealth();
          if (healthCheck) {
            setBackendProgress(100);
            setBackendLogs(prev => [...prev, '✓ Backend is running']);
            setBackendStatus('running');
            return;
          }

          throw new Error('Backend start endpoint not found (404)');
        }
        
        const data = await res.json();
        

        const progress = Math.min(95, Math.round((retryCount / maxRetries) * 90));
        setBackendProgress(progress);
        

        if (data?.log) {
          const logLines = data.log.split('\n').filter((line: string) => line.trim());
          setBackendLogs(logLines.slice(-10));
        }
        
        if (data?.status === 'running') {
          console.log('Backend is now running');
          setBackendProgress(100);
          const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
          setBackendLogs(prev => [...prev, `✓ Backend running (started in ${elapsed}s)`]);
          setBackendStatus('running');
          

          if (currentStep === 0) {
            await new Promise(r => setTimeout(r, 500));
            checkForNewFiles();
          }
        } else if (data?.status === 'starting') {
          const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
          console.log(`Backend still starting... (${elapsed}s, attempt ${retryCount + 1}/${maxRetries})`);
          
          if (retryCount === 0) {
            setBackendStatus('starting');
            setBackendLogs(['🔧 Installing dependencies...', '⏳ Starting backend (this takes 20-30 seconds)']);
          }
          
          retryCount++;

          const delay = Math.min(2000 + retryCount * 200, 5000);
          setTimeout(ensureBackend, delay);
        } else {
          console.error('Backend failed to start:', data);
          setBackendStatus('failed');
          setBackendLogs(prev => [...prev, `❌ Backend error: ${data?.error || 'Unknown error'}`]);
        }
      } catch (err) {
        console.error('Failed to check backend status', err);
        const errorMsg = err instanceof Error ? err.message : 'Network error';
        

        if (retryCount < maxRetries) {
          if (retryCount === 0) {
            setBackendStatus('starting');
            setBackendLogs(['🔧 Installing dependencies...', '⏳ Starting backend...']);
          }
          retryCount++;
          setTimeout(ensureBackend, 2000);
        } else {
          setBackendStatus('failed');
          setBackendLogs(prev => [...prev, `❌ Connection error: ${errorMsg}`]);
        }
      }
    };

    ensureBackend();

  }, [currentStep]);


  useEffect(() => {
    const handleWizardState = async () => {


      try {
        const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
        await fetch(`${API_BASE}/api/indexing/pause${siloParam}`, { 
          method: 'POST',
          signal: AbortSignal.timeout(5000),
        });
        console.log('[SetupWizard] Processing paused for source configuration');
      } catch (err) {
        console.log('[SetupWizard] Could not pause processing:', err);
      }
    };
    
    handleWizardState();
  }, [API_BASE, activeSilo?.name]);

  const checkForNewFiles = async () => {
    if (config.selectedPaths.length === 0) return;
    
    setIsCheckingForNewFiles(true);
    try {
      const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
      const res = await fetch(`${API_BASE}/api/indexing/check-new-files${siloParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: config.selectedPaths }),
      });
      const data = await res.json();
      setNewFilesDetected(data.new_count || 0);
    } catch (err) {
      console.error('Error checking for new files:', err);
    } finally {
      setIsCheckingForNewFiles(false);
    }
  };
  const startTraining = async () => {
    setErrorMsg(null);
    setTrainingStatus('running');
    setProgress({ percentage: 0, processed: 0, total: 0, status: 'scanning' });

    try {

      updatePermissions(tempPermissions);

      console.log('Starting training with paths:', config.selectedPaths);
      if (config.selectedPaths.length === 0) {
        throw new Error('No folders selected. Please go back and select at least one folder.');
      }


      setIndexStartTime(Date.now());


      for (const p of config.selectedPaths) {

        if (!p.startsWith('/') && !p.startsWith('~')) {
          throw new Error(`Path must be absolute or start with ~: "${p}". Please select the full path to the folder.`);
        }
        

        const fullPath = p.startsWith('~') ? p.replace('~', process.env.HOME || '') : p;
        
        console.log('Sending indexing request for path:', fullPath, 'to', `${API_BASE}/api/indexing`);
        try {
          const res = await fetch(`${API_BASE}/api/indexing`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              path: fullPath, 
              recursive: true, 
              includeContent: tempPermissions.indexContent,
              silo_name: activeSilo?.name
            }),
          });
          console.log('Indexing POST response status:', res.status);
          const data = await res.json();
          console.log('Indexing POST response data:', data);
          if (!res.ok) {
            throw new Error(data?.detail || `Failed to start indexing (${res.status})`);
          }
          console.log('Indexing started for path:', p);
        } catch (fetchErr) {
          console.error('Fetch error for path', p, ':', fetchErr);
          throw fetchErr;
        }
      }


      await new Promise((resolve) => setTimeout(resolve, 500));


      let isPolling = true;
      const poll = async () => {
        try {
          const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
          const res = await fetch(`${API_BASE}/api/indexing${siloParam}`);
          const data = await res.json();
          console.log('Poll response:', data);
          
          if (data?.progress) {
            setProgress(data.progress);
            

            const status = data.progress.status;
            if (status === 'complete') {
              console.log('Indexing complete!');
              isPolling = false;
              setTrainingStatus('complete');
              setIndexingComplete(true);
              return;
            }
            if (status === 'error') {
              console.error('Indexing error:', data.progress.error);
              isPolling = false;
              setTrainingStatus('error');
              setErrorMsg(data.progress.error || 'Indexing failed');
              return;
            }
            

            console.log(`Polling: ${data.progress.processed}/${data.progress.total} (${data.progress.percentage}%)`);
            if (isPolling) {
              setTimeout(poll, 800);
            }
          } else {
            console.warn('No progress data in response');
            if (isPolling) {
              setTimeout(poll, 800);
            }
          }
        } catch (err) {
          console.error('Poll error:', err);
          isPolling = false;
          setTrainingStatus('error');
          setErrorMsg(String(err));
        }
      };
      

      poll();
    } catch (err) {
      console.error('Training error:', err);
      setTrainingStatus('error');
      setErrorMsg(String(err));
    }
  };

  useEffect(() => {

    if (currentStep !== 3 && trainingStatus !== 'idle' && trainingStatus !== 'complete') {
      setTrainingStatus('idle');
      setProgress(null);
      setErrorMsg(null);
    }
  }, [currentStep, trainingStatus]);


  useEffect(() => {
    if (currentStep === 3 && trainingStatus === 'idle' && config.selectedPaths.length > 0) {

      const timer = setTimeout(() => {
        startTraining();
      }, 200);
      return () => clearTimeout(timer);
    }

  }, [currentStep, trainingStatus, config.selectedPaths]);

  const handleSkip = () => {

    const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
    fetch(`${API_BASE}/api/indexing/resume${siloParam}`, { method: 'POST' })
      .catch(err => console.error('[SetupWizard] Failed to resume processing:', err));
    setShowSetupWizard(false);
  };

  const [estimatedFileCount, setEstimatedFileCount] = useState<number>(0);
  const [indexStartTime, setIndexStartTime] = useState<number | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string>('');


  useEffect(() => {
    if (config.selectedPaths.length === 0) {
      setEstimatedFileCount(0);
      return;
    }

    const fetchFileCount = async () => {
      try {
        const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
        const res = await fetch(`${API_BASE}/api/indexing/count-files${siloParam}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: config.selectedPaths }),
        });
        if (res.ok) {
          const data = await res.json();
          setEstimatedFileCount(data.total_count || 0);
        }
      } catch (err) {
        console.error('Failed to count files:', err);
      }
    };

    fetchFileCount();

  }, [config.selectedPaths]);


  useEffect(() => {
    if (trainingStatus !== 'running' || !progress || !indexStartTime) {
      setEstimatedTimeRemaining('');
      return;
    }

    const elapsedMs = Date.now() - indexStartTime;
    const percentageComplete = progress.percentage || 0;
    
    if (percentageComplete > 0 && percentageComplete < 100) {
      const totalEstimatedMs = (elapsedMs / percentageComplete) * 100;
      const remainingMs = totalEstimatedMs - elapsedMs;
      const remainingSeconds = Math.round(remainingMs / 1000);
      
      if (remainingSeconds < 60) {
        setEstimatedTimeRemaining(`~${Math.max(1, remainingSeconds)}s remaining`);
      } else {
        const minutes = Math.round(remainingSeconds / 60);
        setEstimatedTimeRemaining(`~${minutes}m remaining`);
      }
    }
  }, [progress, trainingStatus, indexStartTime]);

  const estimateProcessingTime = (fileCount: number = 0): string => {
    const actualCount = fileCount || estimatedFileCount;
    if (actualCount === 0) return '⏱️ Estimated time: calculating...';
    const estimatedMs = actualCount * ESTIMATED_TIME_PER_IMAGE_MS;
    const seconds = Math.round(estimatedMs / 1000);
    const minutes = Math.round(seconds / 60);
    
    if (minutes < 1) return `⏱️ ~${Math.max(1, seconds)} seconds`;
    if (minutes === 1) return '⏱️ ~1 minute';
    return `⏱️ ~${minutes} minutes`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl w-full max-w-2xl h-screen sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden`}>
        <div className={`border-b ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'} p-6 sm:p-8 flex-shrink-0`}>
          <div className="flex items-center justify-between mb-4">
            <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              add source
            </h1>
            <button
              onClick={handleSkip}
              className={`${theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} text-2xl`}
            >
              ✕
            </button>
          </div>
          <p className={`${theme === 'dark' ? 'text-gray-300 lowercase' : 'text-gray-600 lowercase'}`}>
            All processing happens locally on your device. No data leaves your computer.
          </p>
          <p className={`${theme === 'dark' ? 'text-gray-400 lowercase' : 'text-gray-600 lowercase'} text-sm mt-1`}>
            Selected folders and preferences are stored locally to keep your workspace private.
          </p>
          <div className="mt-4 space-y-3">
            {backendStatus === 'running' && (
              <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-green-900 bg-opacity-30 border border-green-700 lowercase' : 'bg-green-50 border border-green-200 lowercase'}`}>
                <p className={`${theme === 'dark' ? 'text-green-300' : 'text-green-700 lowercase'} font-semibold flex items-center gap-2`}>
                  ✓ Backend is running locally
                </p>
              </div>
            )}
            
            {backendStatus === 'starting' && (
              <div className="space-y-2">
                <p className={`${theme === 'dark' ? 'text-amber-400' : 'text-amber-700'} font-semibold flex items-center gap-2`}>
                  <span className="animate-spin">⏳</span> starting backend...
                </p>
                <div className={`w-full h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`}>
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-300"
                    style={{ width: `${backendProgress}%` }}
                  />
                </div>
                
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {backendProgress}% • installing dependencies and loading models (20-30 seconds)
                </p>
                {backendLogs.length > 0 && (
                  <div className={`mt-2 p-2 rounded text-xs font-mono ${theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'} max-h-20 overflow-y-auto`}>
                    {backendLogs.map((log, idx) => (
                      <div key={idx}>{log}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {backendStatus === 'failed' && (
              <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-red-900 bg-opacity-30 border border-red-700' : 'bg-red-50 border border-red-200'}`}>
                <p className={`${theme === 'dark' ? 'text-red-300' : 'text-red-700'} font-semibold mb-2`}>
                  ❌ Backend failed to start
                </p>
                {backendLogs.length > 0 && (
                  <div className={`p-2 rounded text-xs font-mono ${theme === 'dark' ? 'bg-gray-900 text-red-300' : 'bg-gray-50 text-red-700'} max-h-24 overflow-y-auto border ${theme === 'dark' ? 'border-red-700' : 'border-red-300'}`}>
                    {backendLogs.map((log, idx) => (
                      <div key={idx} className="whitespace-pre-wrap break-words">{log}</div>
                    ))}
                  </div>
                )}
                
                <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-red-200' : 'text-red-800'}`}>
                  Check the backend logs in the terminal for more details. You may need to run the backend manually or check system requirements.
                </p>
                
                <button
                  onClick={retryBackendCheck}
                  className={`mt-3 px-3 py-1.5 rounded text-sm font-medium transition ${
                    theme === 'dark'
                      ? 'bg-red-700 hover:bg-red-600 text-white'
                      : 'bg-red-200 hover:bg-red-300 text-red-900'
                  }`}
                >
                  retry
                </button>
              </div>
            )}
          </div>
        </div>
        <div className={`px-6 sm:px-8 pt-6 pb-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} flex-shrink-0`}>
          <div className="flex justify-between items-center">
            {steps.map((step, idx) => (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => setCurrentStep(idx)}
                  className={`w-10 h-10 rounded-full font-semibold transition ${
                    idx === currentStep
                      ? 'bg-orange-600 text-white'
                      : idx < currentStep
                      ? 'bg-green-600 text-white'
                      : theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {idx < currentStep ? '✓' : idx + 1}
                </button>
                {idx < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 transition ${
                      idx < currentStep ? 'bg-green-600' : theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
                    }`}
                  ></div>
                )}
              </React.Fragment>
            ))}
          </div>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-2 lowercase`}>{steps[currentStep].title}</p>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 py-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
          {currentStep === 0 && (
            <div className="space-y-4">
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {config.selectedPaths.length === 0 ? 'add source' : 'add more sources'}
              </h2>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                {config.selectedPaths.length === 0 
                  ? 'select folders to index and search.'
                  : 'add more folders to your collection.'}
              </p>

              {config.selectedPaths.length > 0 && (
                <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-green-900 bg-opacity-30 border-green-700' : 'bg-green-50 border-green-200'}`}>
                  <p className={`${theme === 'dark' ? 'text-green-200' : 'text-green-900'} text-sm font-semibold`}>
                    ✓ {config.selectedPaths.length} source{config.selectedPaths.length !== 1 ? 's' : ''} configured
                  </p>
                </div>
              )}

              {config.selectedPaths.length > 0 && (
                <div className="space-y-3">
                  <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>current sources:</h3>
                  {config.selectedPaths.map((path: string) => (
                    <div
                      key={path}
                      className={`p-3 rounded-lg border flex items-center justify-between ${
                        theme === 'dark' 
                          ? 'bg-gray-700 border-gray-600' 
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>📁 {path}</p>
                      <button
                        onClick={() => removeSelectedPath(path)}
                        className={`text-sm font-semibold ${theme === 'dark' ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-800'}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {newFilesDetected > 0 && (
                <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-orange-900 bg-opacity-30 border-orange-700' : 'bg-orange-50 border-orange-200'}`}>
                  <p className={`${theme === 'dark' ? 'text-orange-200' : 'text-orange-900'} font-semibold`}>
                    ✨ {newFilesDetected} new file{newFilesDetected !== 1 ? 's' : ''} detected!
                  </p>
                  <p className={`text-sm ${theme === 'dark' ? 'text-orange-300' : 'text-orange-800'} mt-1`}>
                    these will be indexed automatically while skipping files already in your collection.
                  </p>
                </div>
              )}

              {isCheckingForNewFiles && (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>checking for new files...</p>
                </div>
              )}

              {!showFolderPicker ? (
                <div className="space-y-2 pt-4">
                  <button
                    onClick={() => setShowFolderPicker(true)}
                    className={`w-full px-4 py-3 rounded-lg font-medium transition ${
                      theme === 'dark'
                        ? 'bg-orange-600 hover:bg-orange-700 text-white'
                        : 'bg-orange-600 hover:bg-orange-700 text-white'
                    }`}
                  >
                    + add source
                  </button>
                  {config.selectedPaths.length > 0 && (
                    <button
                      onClick={checkForNewFiles}
                      disabled={isCheckingForNewFiles}
                      className={`w-full px-4 py-3 rounded-lg font-medium transition ${
                        isCheckingForNewFiles
                          ? 'opacity-50 cursor-not-allowed'
                          : theme === 'dark'
                          ? 'bg-gray-700 hover:bg-gray-600 text-white'
                          : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                      }`}
                    >
                      check for new files
                    </button>
                  )}
                </div>
              ) : (
                <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                  <FolderPicker
                    onPathSelected={(path) => {
                      addSelectedPath(path);
                      setShowFolderPicker(false);
                    }}
                    onCancel={() => setShowFolderPicker(false)}
                    theme={theme}
                  />
                </div>
              )}
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              {!showFolderPicker ? (
                <>
                  <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>confirm directories</h2>
                  <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                   the following directories will be indexed:
                  </p>

                  {config.selectedPaths.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {config.selectedPaths.map((path: string) => (
                        <div
                          key={path}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            theme === 'dark' 
                              ? 'bg-gray-700 border-gray-600' 
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>📁 {path}</span>
                          <button
                            onClick={() => removeSelectedPath(path)}
                            className={`${theme === 'dark' ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-800'} font-semibold`}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <FolderPicker
                  onPathSelected={(path) => {
                    addSelectedPath(path);
                    setShowFolderPicker(false);
                  }}
                  onCancel={() => setShowFolderPicker(false)}
                />
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>grant permissions</h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-700'}`}>
                permissions control what the application can do with your files. only grant what you need.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const allPermissions: Permissions = Object.fromEntries(
                      Object.keys(permissionDescriptions).map((key) => [key, true])
                    ) as unknown as Permissions;
                    setTempPermissions(allPermissions);
                  }}
                  className="px-3 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 transition"
                >
                  select all
                </button>
                <button
                  onClick={() => {
                    const noPermissions: Permissions = Object.fromEntries(
                      Object.keys(permissionDescriptions).map((key) => [key, false])
                    ) as unknown as Permissions;
                    setTempPermissions(noPermissions);
                  }}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition ${
                    theme === 'dark'
                      ? 'bg-gray-700 text-white hover:bg-gray-600'
                      : 'bg-gray-300 text-gray-900 hover:bg-gray-400'
                  }`}
                >
                  clear all
                </button>
              </div>
              <div className={`space-y-2 max-h-96 overflow-y-auto rounded-lg border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} p-2`}>
                {Object.entries(permissionDescriptions).map(([key, { label, description }]) => (
                  <label
                    key={key}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                      theme === 'dark'
                        ? 'border-gray-700 hover:bg-gray-700'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={tempPermissions[key as keyof Permissions]}
                      onChange={() =>
                        handlePermissionToggle(key as keyof Permissions)
                      }
                      className="mt-1 w-4 h-4 text-orange-600"
                    />
                    <div className="flex-1">
                      <p className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{label}</p>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-1`}>{description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>index & learn</h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-700'}`}>
                indexes your photos and trains face/animal recognition. this happens completely offline on your device.
              </p>
              {trainingStatus === 'running' && (
                <div className={`p-4 border-2 rounded-lg ${
                  theme === 'dark'
                    ? 'bg-amber-900 bg-opacity-30 border-amber-700'
                    : 'bg-amber-50 border-amber-300'
                }`}>
                  <p className={`font-semibold flex items-center gap-2 ${theme === 'dark' ? 'text-amber-300' : 'text-amber-900'}`}>
                    keep this application running
                  </p>
                  <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-amber-200' : 'text-amber-800'}`}>
                    the indexing process will continue in the background. do not close the application or stop the backend server until indexing completes. you&apos;ll see a checkmark when finished.
                  </p>
                </div>
              )}
              {config.selectedPaths.length > 0 && trainingStatus === 'idle' && (
                <div className={`p-4 rounded-lg border ${
                  theme === 'dark'
                    ? 'bg-amber-900 bg-opacity-30 border-amber-700'
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-amber-300' : 'text-amber-900'}`}>
                    {estimateProcessingTime(estimatedFileCount)}
                  </p>
                  <p className={`text-xs ${theme === 'dark' ? 'text-amber-200' : 'text-amber-800'} mt-1`}>
                    processing time depends on file count, size, and your system specs.
                  </p>
                </div>
              )}

              <div className={`p-4 border rounded-lg ${
                theme === 'dark'
                  ? 'bg-gray-700 border-gray-600'
                  : 'bg-gray-50 border-gray-200'
              } space-y-3`}>
                {trainingStatus === 'idle' && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                    <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>
                      indexing will start automatically...
                    </span>
                  </div>
                )}
                {trainingStatus !== 'idle' && (
                  <div className="space-y-3">
                    
                    {trainingStatus === 'complete' && (
                      <div className={`p-4 rounded-lg border-2 space-y-2 ${theme === 'dark'
                        ? 'bg-green-900 bg-opacity-30 border-green-700'
                        : 'bg-green-50 border-green-300'
                      }`}>
                        <p className={`font-semibold flex items-center gap-2 ${theme === 'dark' ? 'text-green-300' : 'text-green-900'}`}>
                          ✓ indexing complete
                        </p>
                        <p className={`text-sm ${theme === 'dark' ? 'text-green-200' : 'text-green-800'}`}>
                          your files have been indexed. you can now browse and search your library.
                        </p>
                      </div>
                    )}
                    
                    {errorMsg && (
                      <div className={`p-3 border-2 rounded font-medium ${
                        theme === 'dark'
                          ? 'bg-red-900 bg-opacity-30 border-red-700 text-red-300'
                          : 'bg-red-100 border-red-400 text-red-900'
                      }`}>
                        {errorMsg}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>review & start</h2>
              <div className="space-y-4">
                <div className={`p-4 rounded-lg border ${
                  theme === 'dark'
                    ? 'bg-gray-700 border-gray-600'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>directories:</h3>
                  {config.selectedPaths.length > 0 ? (
                    <ul className={`space-y-1 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                      {config.selectedPaths.map((path: string) => (
                        <li key={path}>• {path}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>no directories selected</p>
                  )}
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark'
                    ? 'bg-gray-700 border-gray-600'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>granted permissions:</h3>
                  <ul className={`space-y-1 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    {Object.entries(permissionDescriptions).map(([key, { label }]) => (
                      tempPermissions[key as keyof Permissions] && (
                        <li key={key}>✓ {label}</li>
                      )
                    ))}
                  </ul>
                  {Object.values(tempPermissions).filter(Boolean).length === 0 && (
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>no permissions granted</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className={`border-t ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'} px-6 sm:px-8 py-4 flex gap-3 justify-between sm:justify-end flex-shrink-0`}>
          <button
            onClick={handleSkip}
            className={`px-4 py-2 transition ${
              theme === 'dark'
                ? 'text-gray-300 hover:text-white'
                : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            skip
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              className={`px-4 py-2 border rounded-lg transition disabled:opacity-50 ${
                theme === 'dark'
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              back
            </button>

            <button
              onClick={() => {
                if (currentStep === steps.length - 1) {
                  handleComplete();
                } else if (currentStep === 2) {

                  setCurrentStep(currentStep + 1);

                  setTimeout(() => startTraining(), 100);
                } else {
                  setCurrentStep(currentStep + 1);
                }
              }}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition lowercase"
            >
              {currentStep === steps.length - 1 ? 'complete' : currentStep === 2 ? 'next & start indexing' : 'next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
