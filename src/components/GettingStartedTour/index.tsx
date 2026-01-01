'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';

interface TourStep {
  id: string;
  title: string;
  description: string;
  action?: () => void;
  targetView?: 'browser' | 'search' | 'people' | 'animals' | 'audio' | 'settings' | 'retraining';
  condition?: () => boolean;
  hideWizard?: boolean;
}

const DEMO_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: '🎬 welcome to silo demo',
    description: 'you\'re viewing a read-only demo with pre-loaded celebrity photos. all the features work—you just can\'t modify data. this shows what silo can do with your own photo collection!',
  },
  {
    id: 'demo-files',
    title: '📁 demo files already indexed',
    description: 'we\'ve already indexed celebrity photos for you:\n• david bowie\n• christopher walken\n• paula abdul\n• luka dončić\n• tito\n\nno setup needed—just explore!',
    targetView: 'browser',
  },
  {
    id: 'view-processing',
    title: '📊 view processing logs',
    description: 'check the statistics tab to see how these demo files were processed. the debug log shows the actual AI indexing, face detection, and clustering that happened.',
    targetView: 'settings',
  },
  {
    id: 'view-people',
    title: '👥 explore face clusters',
    description: 'the people tab shows automatically detected and clustered faces. click on any celebrity to see all their photos. this is what silo does with your photos automatically!',
    targetView: 'people',
  },
  {
    id: 'semantic-search',
    title: '🔍 try AI-powered search',
    description: 'silo uses AI to understand your searches. try these:\n• "bible" or "declaration" (finds text via OCR)\n• "david bowie" or "christopher walken" (finds faces)\n• "sunset" or "flowers" (finds objects/scenes)\n\nno tags, no manual organization—just describe what you want!',
    targetView: 'search',
  },
  {
    id: 'demo-limitations',
    title: '⚠️ demo mode limitations',
    description: 'this demo is read-only, so you can\'t:\n• add new photo sources\n• rename or organize clusters\n• retrain models\n• modify any data\n\nto use silo with your own photos, clone the repo and run ./start-all.sh locally!',
  },
  {
    id: 'complete',
    title: '✅ explore at your own pace!',
    description: 'feel free to explore all the demo features. when ready to use silo with your own photos, visit the github repo for setup instructions.\n\nhttps://github.com/ilovespectra/solo-silo',
  },
];

const LOCAL_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'welcome to silo',
    description: 'let\'s get you started by adding your first media source. silo will index your photos and videos using AI—all processing happens locally on your machine.',
  },
  {
    id: 'add-source',
    title: 'add a media source',
    description: 'click the "add source" button to select a folder containing your photos. this will start indexing your media with face detection, object recognition, and text extraction.',
    targetView: 'browser',
    hideWizard: true,
  },
  {
    id: 'indexing',
    title: 'indexing in progress',
    description: 'your media is being indexed by the local backend. check the statistics tab to monitor progress. indexing time depends on your collection size and hardware.',
    targetView: 'settings',
  },
  {
    id: 'face-clustering',
    title: 'face detection complete',
    description: 'faces have been detected! now cluster them by going to the retraining tab and clicking "cluster faces" to group similar faces together.',
    targetView: 'retraining',
  },
  {
    id: 'view-people',
    title: 'view your face clusters',
    description: 'clustering is done! check out the people tab to see all detected face clusters from your photos.',
    targetView: 'people',
  },
  {
    id: 'manage-cluster',
    title: 'manage face clusters',
    description: 'click on a person card to:\n• confirm or remove photos\n• add a name to the person\n• move photos between clusters\n• when all photos are confirmed, hit the retrain button to improve accuracy',
    targetView: 'people',
  },
  {
    id: 'semantic-search',
    title: 'try semantic search',
    description: 'silo uses AI to understand your searches. try searching your collection for:\n• objects and scenes in your photos\n• colors and visual elements\n• people you\'ve named\n• concepts and moments\n\nno tags needed—just describe what you\'re looking for!',
    targetView: 'search',
  },
  {
    id: 'complete',
    title: 'you\'re all set!',
    description: 'you can now search faces, objects, and media using natural language. explore multi-silo support, favorites, and audio transcription in the settings.',
  },
];

export const GettingStartedTour: React.FC = () => {
  const { 
    theme, 
    setCurrentView, 
    currentView,
    showGettingStartedTour,
    setShowGettingStartedTour,
    gettingStartedStep,
    setGettingStartedStep,
    setTourAutoOpenDebugLog,
    showSetupWizard,
  } = useAppStore();

  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  
  useEffect(() => {
    async function detectMode() {
      try {
        const response = await fetch('http://127.0.0.1:8000/api/system/health', {
          signal: AbortSignal.timeout(1000),
        });
        setDemoMode(!response.ok ? true : false);
        console.log('[GettingStartedTour] Backend available, local mode');
      } catch (error) {
        setDemoMode(true);
        console.log('[GettingStartedTour] No backend, demo mode');
      }
    }
    detectMode();
  }, []);
  
  const TOUR_STEPS = useMemo(() => {
    const isDemo = demoMode !== false;
    console.log('[GettingStartedTour] demo mode:', demoMode, 'using tour:', isDemo ? 'DEMO' : 'LOCAL');
    return isDemo ? DEMO_TOUR_STEPS : LOCAL_TOUR_STEPS;
  }, [demoMode]);

  useEffect(() => {
    if (demoMode !== null) {
      console.log('[GettingStartedTour] mode determined, resetting to step 0');
      setGettingStartedStep(0);
    }
  }, [demoMode, setGettingStartedStep]);

  useEffect(() => {
    if (demoMode !== null) {
      console.log('[GettingStartedTour] mode determined, resetting to step 0');
      setGettingStartedStep(0);
    }
  }, [demoMode, setGettingStartedStep]);

  useEffect(() => {
    const currentStep = TOUR_STEPS[gettingStartedStep];
    setTimeout(() => {
      if (showSetupWizard && currentStep?.hideWizard) {
        setIsMinimized(true);
      } else {
        setIsMinimized(false);
      }
    }, 0);
  }, [showSetupWizard, gettingStartedStep, TOUR_STEPS]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem('tour-dismissed');
      
      if (dismissed === 'true') {
        setTimeout(() => {
          setDismissed(true);
          setShowGettingStartedTour(false);
        }, 0);
      } else {
        setTimeout(() => {
          setShowGettingStartedTour(true);
        }, 0);
      }
    }
  }, [setShowGettingStartedTour]);

  useEffect(() => {
    if (showGettingStartedTour && !dismissed) {
      const currentStep = TOUR_STEPS[gettingStartedStep];
      if (currentStep?.targetView && currentStep.targetView !== currentView) {
        console.log(`[Tour] Auto-navigating to ${currentStep.targetView} for step: ${currentStep.title}`);
        setCurrentView(currentStep.targetView);
      }
    }
  }, [showGettingStartedTour, gettingStartedStep, currentView, setCurrentView, dismissed, TOUR_STEPS]);

  useEffect(() => {
    if (showGettingStartedTour && gettingStartedStep === 2 && currentView === 'settings') {
      if (demoMode !== true) {
        setTourAutoOpenDebugLog(true);
      }
    }
  }, [showGettingStartedTour, gettingStartedStep, currentView, setTourAutoOpenDebugLog, demoMode]);

  if (!showGettingStartedTour || dismissed) {
    return null;
  }

  const currentStep = TOUR_STEPS[gettingStartedStep];
  if (!currentStep) {
    return null;
  }

  const handleNext = () => {
    if (gettingStartedStep < TOUR_STEPS.length - 1) {
      const nextStep = gettingStartedStep + 1;
      setGettingStartedStep(nextStep);
      
      const nextStepData = TOUR_STEPS[nextStep];
      if (nextStepData.action) {
        nextStepData.action();
      }
    } else {
      handleComplete();
    }
  };

  const canProceed = () => {
    if (!currentStep.targetView) return true;
    return currentView === currentStep.targetView;
  };

  const handleSkip = () => {
    setShowGettingStartedTour(false);
  };

  const handleDontShowAgain = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tour-dismissed', 'true');
    }
    setDismissed(true);
    setShowGettingStartedTour(false);
  };

  const handleComplete = () => {
    setShowGettingStartedTour(false);
    setGettingStartedStep(0);
  };

  const bgClass = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
  const secondaryTextClass = theme === 'dark' ? 'text-gray-300' : 'text-gray-600';

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className={`fixed bottom-6 right-6 z-50 p-3 rounded-full shadow-lg border-2 border-orange-500 ${bgClass} hover:scale-110 transition-transform`}
        title="show tour guide"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className="w-6 h-6 text-orange-500"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-in slide-in-from-bottom-8">
      <div className={`${bgClass} rounded-lg shadow-2xl border-2 border-orange-500 overflow-hidden`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-orange-600 to-orange-500">
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col">
              <h2 className="text-xl font-bold text-white">
                {currentStep.title}
              </h2>
            </div>
            <button
              onClick={handleSkip}
              className="text-sm text-white hover:text-gray-200 transition-colors"
            >
              skip
            </button>
          </div>
          <div className="flex items-center gap-1">
            {TOUR_STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded ${
                  index === gettingStartedStep
                    ? 'bg-white'
                    : index < gettingStartedStep
                    ? 'bg-white bg-opacity-60'
                    : 'bg-white bg-opacity-20'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className={`${secondaryTextClass} whitespace-pre-line leading-relaxed text-sm`}>
            {currentStep.description}
          </p>
          {currentStep.targetView && (
            <div className="mt-3 px-3 py-2 bg-orange-500 bg-opacity-10 rounded text-orange-500 text-xs font-medium">
              now viewing: {currentStep.targetView}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex items-center justify-between">
          <button
            onClick={handleDontShowAgain}
            className={`text-xs ${secondaryTextClass} hover:text-orange-500 transition-colors`}
          >
            don&apos;t show again
          </button>
          
          <div className="flex gap-2">{gettingStartedStep > 0 && (
              <button
                onClick={() => setGettingStartedStep(gettingStartedStep - 1)}
                className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                }`}
              >
                back
              </button>
            )}
            
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${
                canProceed()
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-gray-500 text-gray-300 cursor-not-allowed'
              }`}
            >
              {gettingStartedStep === TOUR_STEPS.length - 1 ? 'finish' : 'next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GettingStartedTour;
