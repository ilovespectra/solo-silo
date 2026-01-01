'use client';

import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';

interface TourStep {
  id: string;
  title: string;
  description: string;
  action?: () => void;
  targetView?: 'browser' | 'search' | 'people' | 'animals' | 'audio' | 'settings' | 'retraining';
  condition?: () => boolean;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'welcome to silo',
    description: 'let\'s get you started by adding your first media source.',
  },
  {
    id: 'add-source',
    title: 'add a media source',
    description: 'click the "add source" button to add a folder path where your photos are stored. this will start indexing your media.',
    targetView: 'browser',
  },
  {
    id: 'indexing',
    title: 'indexing in progress',
    description: 'your media is being indexed. check the database manager in settings to see progress. this may take a few minutes depending on your collection size.',
    targetView: 'settings',
  },
  {
    id: 'face-clustering',
    title: 'face detection complete',
    description: 'faces have been detected! now let\'s cluster them. go to retraining tab and click "cluster faces" to group similar faces together.',
    targetView: 'retraining',
  },
  {
    id: 'view-people',
    title: 'view your face clusters',
    description: 'clustering is done! check out the people tab to see all detected face clusters.',
    targetView: 'people',
  },
  {
    id: 'manage-cluster',
    title: 'manage face clusters',
    description: 'click on a person card to:\n• confirm or remove photos\n• add a name to the person\n• move photos to other clusters\n• when all photos are confirmed, hit the retrain button to improve face search',
    targetView: 'people',
  },
  {
    id: 'complete',
    title: 'you\'re all set!',
    description: 'you can now search for faces, objects, and media using the search tab. explore the features and organize your collection.',
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
  } = useAppStore();

  const [dismissed, setDismissed] = useState(false);

  // Auto-show tour on first visit if not dismissed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem('tour-dismissed');
      const tourCompleted = localStorage.getItem('tour-completed');
      
      if (dismissed === 'true') {
        // Use setTimeout to avoid setState during render
        setTimeout(() => {
          setDismissed(true);
          setShowGettingStartedTour(false);
        }, 0);
      } else if (tourCompleted !== 'true') {
        // Show tour on first visit
        setTimeout(() => {
          setShowGettingStartedTour(true);
        }, 0);
      }
    }
  }, [setShowGettingStartedTour]); // Only run once on mount

  // Auto-navigate to the target view when step changes
  useEffect(() => {
    if (showGettingStartedTour && !dismissed) {
      const currentStep = TOUR_STEPS[gettingStartedStep];
      if (currentStep?.targetView && currentStep.targetView !== currentView) {
        console.log(`[Tour] Auto-navigating to ${currentStep.targetView} for step: ${currentStep.title}`);
        setCurrentView(currentStep.targetView);
      }
    }
  }, [showGettingStartedTour, gettingStartedStep, currentView, setCurrentView, dismissed]);

  // Auto-advance to indexing step when user is on add-source step and navigates to settings
  useEffect(() => {
    if (showGettingStartedTour && gettingStartedStep === 1 && currentView === 'settings') {
      // Set flag to auto-open debug log in Settings component
      setTourAutoOpenDebugLog(true);
    }
  }, [showGettingStartedTour, gettingStartedStep, currentView, setTourAutoOpenDebugLog]);

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
      
      // Navigation will be handled by the useEffect above
      const nextStepData = TOUR_STEPS[nextStep];
      if (nextStepData.action) {
        nextStepData.action();
      }
    } else {
      handleComplete();
    }
  };

  // Check if we can proceed to next step (for steps that require being on correct view)
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
    if (typeof window !== 'undefined') {
      localStorage.setItem('tour-completed', 'true');
    }
    setShowGettingStartedTour(false);
    setGettingStartedStep(0);
  };

  const bgClass = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
  const secondaryTextClass = theme === 'dark' ? 'text-gray-300' : 'text-gray-600';

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-in slide-in-from-bottom-8">
      <div className={`${bgClass} rounded-lg shadow-2xl border-2 border-orange-500 overflow-hidden`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-orange-600 to-orange-500">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-white">
              {currentStep.title}
            </h2>
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
              👉 Now viewing: {currentStep.targetView}
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
