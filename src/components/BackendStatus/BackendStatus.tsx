'use client';

import { useEffect, useState } from 'react';

export function BackendStatus() {
  const [status, setStatus] = useState<'checking' | 'online' | 'spinning-up' | 'offline'>('checking');
  const [eta, setEta] = useState<number | null>(null);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const start = Date.now();
        const response = await fetch('/api/health', { 
          signal: AbortSignal.timeout(5000) 
        });
        
        if (response.ok) {
          setStatus('online');
          setEta(null);
        } else {
          setStatus('offline');
        }
      } catch (error) {
        setStatus('spinning-up');
        setEta(30);
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 10000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status === 'spinning-up' && eta !== null && eta > 0) {
      const countdown = setInterval(() => {
        setEta(prev => prev !== null && prev > 0 ? prev - 1 : 0);
      }, 1000);
      
      return () => clearInterval(countdown);
    }
  }, [status, eta]);

  if (status === 'online') return null;

  return (
    <div className="fixed bottom-4 right-4 bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 dark:border-yellow-600 rounded-lg p-4 shadow-lg max-w-sm">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {status === 'spinning-up' && (
            <svg className="animate-spin h-5 w-5 text-yellow-600 dark:text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {status === 'offline' && (
            <svg className="h-5 w-5 text-red-600 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            {status === 'checking' && 'Checking backend status...'}
            {status === 'spinning-up' && 'Backend waking up'}
            {status === 'offline' && 'Backend offline'}
          </h3>
          <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
            {status === 'spinning-up' && (
              <>
                The search service is starting up. This typically takes 30-60 seconds.
                {eta !== null && eta > 0 && ` Estimated time: ~${eta}s`}
              </>
            )}
            {status === 'offline' && 'Search functionality is currently unavailable. Please try again later.'}
          </p>
        </div>
      </div>
    </div>
  );
}
