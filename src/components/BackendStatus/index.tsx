'use client';
import { apiUrl } from '@/lib/api';

import { useState, useEffect } from 'react';

export function BackendStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  const checkBackendHealth = async (): Promise<boolean> => {
    try {
      const healthRes = await fetch('/api/health', {
        signal: AbortSignal.timeout(2000),
      });
      return healthRes.ok;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const checkStatus = async () => {
      setCheckingStatus(true);
      const connected = await checkBackendHealth();
      setIsConnected(connected);
      setCheckingStatus(false);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleInitialize = async () => {
    setIsInitializing(true);
    try {
      console.log('🚀 Requesting backend start...');
      const startRes = await fetch(apiUrl('/api/system/backend/start'), { method: 'POST' });
      const startData = await startRes.json();
      console.log('📡 backend start response:', startData);

      let ready = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!ready && attempts < maxAttempts) {
        try {
          console.log(`⏳ Checking backend health (attempt ${attempts + 1}/${maxAttempts})...`);
          ready = await checkBackendHealth();
          if (ready) {
            console.log('✅ Backend is ready');
            setIsConnected(true);
            return;
          }
        } catch {
          console.log(`⏳ Backend not ready yet, waiting...`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      console.warn('⚠️ Backend did not start in time');
      setIsConnected(false);
    } catch (err) {
      console.error('❌ Failed to start backend:', err);
      setIsConnected(false);
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <div
      className="px-4 py-3 flex items-center justify-between gap-3 border-b transition"
      style={{
        backgroundColor: isConnected ? 'var(--green-glow)' : 'var(--border-error)',
        borderColor: isConnected ? 'var(--border-success)' : 'var(--border-error)',
        color: 'var(--text-primary)'
      }}
    >
      <div className="flex items-center gap-3 flex-1">
        <div className="flex items-center gap-2">
          {checkingStatus ? (
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--text-secondary)' }}
            ></div>
          ) : (
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: isConnected ? 'var(--green-primary)' : 'var(--orange-primary)'
              }}
            ></div>
          )}
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            backend: {checkingStatus ? 'checking...' : isConnected ? 'connected ✓ offline' : 'disconnected'}
          </span>
        </div>
      </div>

      {!isConnected && (
        <button
          onClick={handleInitialize}
          disabled={isInitializing}
          className="px-3 py-1 rounded text-sm font-medium transition whitespace-nowrap text-white"
          style={{
            backgroundColor: isInitializing ? 'var(--bg-tertiary)' : 'var(--orange-primary)',
            cursor: isInitializing ? 'not-allowed' : 'pointer',
            opacity: isInitializing ? '0.5' : '1'
          }}
        >
          {isInitializing ? (
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></div>
              Starting...
            </div>
          ) : (
            '▶ Connect'
          )}
        </button>
      )}
    </div>
  );
}
