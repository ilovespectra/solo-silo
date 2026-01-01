'use client';

import { useAppStore, setupConfigPersistence } from '@/store/appStore';
import SetupWizard from '@/components/SetupWizard';
import GettingStartedTour from '@/components/GettingStartedTour';
import MediaGallery from '@/components/MediaGallery';
import AudioBrowser from '@/components/AudioBrowser';
import Search from '@/components/Search';
import Settings from '@/components/Settings';
import PeoplePane from '@/components/PeoplePane';
import AnimalPane from '@/components/AnimalPane';
import Retraining from '@/components/Retraining';
import BackendStatus from '@/components/BackendStatus';
import { DemoBanner } from '@/components/DemoBanner';
import { SiloSelector } from '@/components/SiloSelector';
import { SiloManager } from '@/components/SiloManager';
import { useIndexingStatus } from '@/hooks/useIndexingStatus';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useState, useEffect } from 'react';

export default function Home() {
  const { showSetupWizard, currentView, setCurrentView, theme, setTheme, setShowSetupWizard, setShowGettingStartedTour, setGettingStartedStep } = useAppStore();
  const [mounted, setMounted] = useState(false);
  const [hasIndexedFiles, setHasIndexedFiles] = useState(false);
  const [showSiloManager, setShowSiloManager] = useState(false);
  const [siloSwitchKey, setSiloSwitchKey] = useState(0);
  const { demoMode } = useDemoMode();

  useIndexingStatus();

  const handleRestartTour = () => {
    localStorage.removeItem('tour-dismissed');
    
    setGettingStartedStep(0);
    setShowGettingStartedTour(true);
  };

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('🔍 checking for indexed files...');
        const response = await fetch('http://localhost:8000/api/status/has-indexed-files', {
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const data = await response.json();
          console.log('database check successful:', data);
          setHasIndexedFiles(data.has_indexed_files);
        } else {
          console.warn('⚠️ failed to check indexed files:', response.status, response.statusText);
          setHasIndexedFiles(false);
        }
      } catch (err) {
        console.error('❌ failed to initialize app:', err);
        setHasIndexedFiles(false);
      } finally {
        setMounted(true);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    if (mounted) {
      setupConfigPersistence();
    }
  }, [mounted]);

  useEffect(() => {
    if (mounted) {
      console.log('Wizard logic - hasIndexedFiles:', hasIndexedFiles);
      const shouldShowWizard = !hasIndexedFiles;
      console.log('Setting showSetupWizard to:', shouldShowWizard);
      setShowSetupWizard(shouldShowWizard);
    }
  }, [mounted, hasIndexedFiles, setShowSetupWizard]);

  if (!mounted) {
    return (
      <div className={`w-screen h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
        <div className="text-center">
          <div className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>
            loading silo...
          </div>
          <div className={`w-8 h-8 border-4 border-t-orange-500 rounded-full animate-spin mx-auto ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}></div>
        </div>
      </div>
    );
  }

  return (
    <main className={`h-screen flex flex-col ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Demo Mode Banner */}
      {demoMode && <DemoBanner />}
      
      {/* Backend Status Bar */}
      <BackendStatus />

      {/* Header */}
      <header className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4 shadow-sm`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="silo" className="w-8 h-8" />
            <div>
              <h1 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>silo:</h1>
              <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>powered by local ai • all data stays on your device</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRestartTour}
              className={`p-2 rounded-lg transition ${
                theme === 'dark'
                  ? 'text-gray-400 hover:bg-gray-700 hover:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
              title="Restart Getting Started Tour"
              aria-label="Restart Getting Started Tour"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="w-5 h-5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            <SiloSelector onSiloSwitch={async () => {
              try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'}/api/status/has-indexed-files`, {
                  signal: AbortSignal.timeout(5000),
                });
                if (response.ok) {
                  const data = await response.json();
                  setHasIndexedFiles(data.has_indexed_files);
                }
              } catch (err) {
                console.error('Failed to refresh indexed files check:', err);
              }
              
              try {
                await useAppStore.getState().reloadFolders();
              } catch (err) {
                console.error('Failed to reload folders:', err);
              }
              
              setSiloSwitchKey(prev => prev + 1);
            }} onShowManager={() => setShowSiloManager(true)} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <nav className={`w-40 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-r p-4 flex flex-col gap-2 justify-between`}>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setCurrentView('browser')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                currentView === 'browser'
                  ? theme === 'dark'
                    ? 'bg-orange-600 text-white'
                    : 'bg-orange-100 text-orange-700'
                  : theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              browser
            </button>
            <button
              onClick={() => setCurrentView('search')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                currentView === 'search'
                  ? theme === 'dark'
                    ? 'bg-orange-600 text-white'
                    : 'bg-orange-100 text-orange-700'
                  : theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              search
            </button>
            <button
              onClick={() => setCurrentView('people')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                currentView === 'people'
                  ? theme === 'dark'
                    ? 'bg-orange-600 text-white'
                    : 'bg-orange-100 text-orange-700'
                  : theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              people
            </button>
            <button
              onClick={() => setCurrentView('animals')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                currentView === 'animals'
                  ? theme === 'dark'
                    ? 'bg-orange-600 text-white'
                    : 'bg-orange-100 text-orange-700'
                  : theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              animals
            </button>
            <button
              onClick={() => setCurrentView('audio')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                currentView === 'audio'
                  ? theme === 'dark'
                    ? 'bg-orange-600 text-white'
                    : 'bg-orange-100 text-orange-700'
                  : theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              audio
            </button>
            <button
              onClick={() => setCurrentView('settings')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                currentView === 'settings'
                  ? theme === 'dark'
                    ? 'bg-orange-600 text-white'
                    : 'bg-orange-100 text-orange-700'
                  : theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              stats
            </button>
            {/* <button
              onClick={() => setCurrentView('retraining')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                currentView === 'retraining'
                  ? theme === 'dark'
                    ? 'bg-orange-600 text-white'
                    : 'bg-orange-100 text-orange-700'
                  : theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
              title="Fine-tune face recognition model"
            >
              🤖 Retrain
            </button> */}
          </div>

          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              theme === 'dark'
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
            }`}
            title="toggle theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </nav>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {currentView === 'browser' && <MediaGallery key={`browser-${siloSwitchKey}`} />}
          {currentView === 'audio' && <AudioBrowser key={`audio-${siloSwitchKey}`} />}
          {currentView === 'search' && <Search key={`search-${siloSwitchKey}`} />}
          {currentView === 'people' && <PeoplePane key={`people-${siloSwitchKey}`} />}
          {currentView === 'animals' && <AnimalPane key={`animals-${siloSwitchKey}`} />}
          {currentView === 'settings' && <Settings key={`settings-${siloSwitchKey}`} />}
          {currentView === 'retraining' && <Retraining key={`retraining-${siloSwitchKey}`} />}
        </div>
      </div>

      {/* Silo Manager Modal */}
      <SiloManager isOpen={showSiloManager} onClose={() => setShowSiloManager(false)} />

      {/* Setup Wizard Modal */}
      {showSetupWizard && <SetupWizard />}

      {/* Getting Started Tour */}
      <GettingStartedTour />
    </main>
  );
}
