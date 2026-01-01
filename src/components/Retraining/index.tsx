import { apiUrl } from '@/lib/api';
'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';

interface RetrainingMetrics {
  model_version: number;
  training_samples: number;
  confirmed_people: number;
  cluster_count: number;
  embeddings_regenerated: number;
  avg_intra_cluster_distance: number;
  avg_inter_cluster_distance: number;
  timestamp: number;
}

interface TrainingDataPreview {
  status: string;
  ready_for_training: boolean;
  confirmed_people_count: number;
  total_training_samples: number;
  minimum_required_samples: number;
  people: Array<{
    person_id: string;
    person_label: string;
    face_count: number;
    sample_media_id: number;
    avg_confidence: number;
  }>;
}

interface QualityMetrics {
  model_version: number;
  quality_metrics: {
    intra_cluster_distance: number;
    inter_cluster_distance: number;
    silhouette_score: number;
    training_samples: number;
    confirmed_people: number;
  };
}

interface ModelVersion {
  version: number;
  timestamp: number;
  base_model: string;
  training_samples: number;
  confirmed_people: number;
  metrics: Record<string, unknown>;
  description: string;
  active: boolean;
}

export default function RetrainingPanel() {
  const { theme } = useAppStore();
  const [isRetraining, setIsRetraining] = useState(false);
  const [retrainingProgress, setRetrainingProgress] = useState(0);
  const [retrainingMessage, setRetrainingMessage] = useState('');
  const [lastMetrics, setLastMetrics] = useState<RetrainingMetrics | null>(null);
  const [trainingData, setTrainingData] = useState<TrainingDataPreview | null>(null);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics | null>(null);
  const [modelVersions, setModelVersions] = useState<ModelVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadRetrainingStatus();
    loadTrainingDataPreview();
    loadQualityMetrics();
  }, []);

  const loadRetrainingStatus = async () => {
    try {
      const response = await fetch(apiUrl('/api/retraining/status');
      const data = await response.json();
      if (data.versions) {
        setModelVersions(data.versions);
        if (data.versions.length > 0) {
          const latest = data.versions[data.versions.length - 1];
          setLastMetrics({
            model_version: latest.version,
            training_samples: latest.training_samples,
            confirmed_people: latest.confirmed_people,
            cluster_count: 0,
            embeddings_regenerated: 0,
            avg_intra_cluster_distance: latest.metrics?.intra_cluster_distance || 0,
            avg_inter_cluster_distance: latest.metrics?.inter_cluster_distance || 0,
            timestamp: latest.timestamp
          });
        }
      }
    } catch (err) {
      console.error('Failed to load retraining status:', err);
    }
  };

  const loadTrainingDataPreview = async () => {
    try {
      const response = await fetch(apiUrl('/api/retraining/faces-for-training');
      const data = await response.json();
      setTrainingData(data);
    } catch (err) {
      console.error('Failed to load training data preview:', err);
    }
  };

  const loadQualityMetrics = async () => {
    try {
      const response = await fetch(apiUrl('/api/retraining/quality-metrics');
      const data = await response.json();
      if (data.status === 'success') {
        setQualityMetrics(data);
      }
    } catch (err) {
      console.error('Failed to load quality metrics:', err);
    }
  };

  const handleStartRetraining = async () => {
    if (!trainingData?.ready_for_training) {
      setError('Not enough confirmed people for retraining. Please confirm at least one person first.');
      return;
    }

    setIsRetraining(true);
    setError(null);
    setRetrainingProgress(0);
    setRetrainingMessage('Initializing retraining pipeline...');

    try {
      const response = await fetch(apiUrl('/api/retraining/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.status === 'success') {
        setRetrainingMessage('Retraining completed successfully!');
        setRetrainingProgress(100);
        if (data.metrics) {
          setLastMetrics(data.metrics);
        }
        setTimeout(() => {
          loadRetrainingStatus();
          loadTrainingDataPreview();
          loadQualityMetrics();
        }, 1000);
      } else {
        setError(data.message || 'Retraining failed');
        setRetrainingMessage('Error occurred during retraining');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setRetrainingMessage('Error occurred during retraining');
    } finally {
      setIsRetraining(false);
    }
  };

  const bgClass = theme === 'dark' ? 'bg-gray-900' : 'bg-white';
  const textClass = theme === 'dark' ? 'text-white' : 'text-gray-900';
  const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
  const cardClass = theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50';
  const hoverClass = theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100';

  return (
    <div className={`flex flex-col h-full ${bgClass}`}>
      {/* Header */}
      <div className={`border-b ${borderClass} p-6`}>
        <h2 className={`text-2xl font-bold ${textClass} mb-2`}>Model Retraining</h2>
        <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-sm`}>
          Refine face recognition by retraining on confirmed face clusters
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl space-y-6">
          {/* Error Alert */}
          {error && (
            <div className={`p-4 rounded-lg border ${
              theme === 'dark'
                ? 'bg-red-900 bg-opacity-20 border-red-700 text-red-300'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              <p className="font-semibold mb-1">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Training Data Status */}
          {trainingData && (
            <div className={`rounded-lg border ${borderClass} p-6 ${cardClass}`}>
              <h3 className={`text-lg font-semibold ${textClass} mb-4`}>Training Data Status</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                    Confirmed People
                  </p>
                  <p className={`text-3xl font-bold ${textClass}`}>
                    {trainingData.confirmed_people_count}
                  </p>
                </div>

                <div>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                    Face Samples
                  </p>
                  <p className={`text-3xl font-bold ${textClass}`}>
                    {trainingData.total_training_samples}
                  </p>
                </div>

                <div>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                    Ready for Training
                  </p>
                  <p className={`text-3xl font-bold ${
                    trainingData.ready_for_training
                      ? 'text-green-500'
                      : 'text-amber-500'
                  }`}>
                    {trainingData.ready_for_training ? '✓' : '✗'}
                  </p>
                </div>
              </div>

              {!trainingData.ready_for_training && (
                <div className={`p-3 rounded ${
                  theme === 'dark'
                    ? 'bg-amber-900 bg-opacity-20'
                    : 'bg-amber-50'
                }`}>
                  <p className={`text-sm ${
                    theme === 'dark'
                      ? 'text-amber-300'
                      : 'text-amber-800'
                  }`}>
                    Confirm at least {trainingData.minimum_required_samples} people to enable retraining
                  </p>
                </div>
              )}

              {trainingData.people.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className={`text-sm font-semibold ${
                      theme === 'dark'
                        ? 'text-orange-400 hover:text-orange-300'
                        : 'text-orange-600 hover:text-orange-800'
                    }`}
                  >
                    {showDetails ? 'Hide' : 'Show'} Training People ({trainingData.people.length})
                  </button>

                  {showDetails && (
                    <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                      {trainingData.people.map((person) => (
                        <div
                          key={person.person_id}
                          className={`p-3 rounded border ${borderClass} ${
                            theme === 'dark'
                              ? 'bg-gray-700 bg-opacity-50'
                              : 'bg-white'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <p className={`font-semibold ${textClass} truncate`}>
                                {person.person_label || 'Unknown'}
                              </p>
                              <p className={`text-xs ${
                                theme === 'dark'
                                  ? 'text-gray-400'
                                  : 'text-gray-600'
                              }`}>
                                ID: {person.person_id}
                              </p>
                            </div>
                            <div className="text-right ml-4">
                              <p className={`text-sm font-semibold ${textClass}`}>
                                {person.face_count} faces
                              </p>
                              <p className={`text-xs ${
                                theme === 'dark'
                                  ? 'text-gray-400'
                                  : 'text-gray-600'
                              }`}>
                                Confidence: {(person.avg_confidence * 100).toFixed(0)}%
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Retraining Control */}
          <div className={`rounded-lg border ${borderClass} p-6 ${cardClass}`}>
            <h3 className={`text-lg font-semibold ${textClass} mb-4`}>Start Retraining</h3>

            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-6`}>
              Retraining will:
            </p>
            <ul className={`text-sm space-y-2 mb-6 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>✓ Extract face crops from all confirmed people</li>
              <li>✓ Regenerate embeddings for all {trainingData?.total_training_samples} face samples</li>
              <li>✓ Recalculate clusters with improved embeddings</li>
              <li>✓ Save new model version with metrics</li>
            </ul>

            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
              ⏱️ Estimated time: 5-15 minutes depending on library size
            </p>

            <button
              onClick={handleStartRetraining}
              disabled={isRetraining || !trainingData?.ready_for_training}
              className={`w-full px-6 py-3 rounded-lg font-semibold text-white transition ${
                isRetraining || !trainingData?.ready_for_training
                  ? 'bg-gray-500 cursor-not-allowed opacity-50'
                  : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {isRetraining ? 'Retraining in progress...' : 'Start Full Retraining'}
            </button>

            {/* Progress Bar */}
            {isRetraining && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <p className={`text-sm font-semibold ${textClass}`}>
                    {retrainingMessage}
                  </p>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {retrainingProgress}%
                  </p>
                </div>
                <div className={`h-2 rounded-full overflow-hidden ${
                  theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                }`}>
                  <div
                    className="h-full bg-orange-600 transition-all"
                    style={{ width: `${retrainingProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Quality Metrics */}
          {qualityMetrics && (
            <div className={`rounded-lg border ${borderClass} p-6 ${cardClass}`}>
              <h3 className={`text-lg font-semibold ${textClass} mb-4`}>Model Quality Metrics</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className={`text-xs uppercase tracking-wider ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  } mb-2`}>
                    Intra-Cluster Distance
                  </p>
                  <p className={`text-2xl font-bold ${textClass}`}>
                    {qualityMetrics.quality_metrics.intra_cluster_distance?.toFixed(3) || 'N/A'}
                  </p>
                  <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
                    Lower = tighter clusters
                  </p>
                </div>

                <div>
                  <p className={`text-xs uppercase tracking-wider ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  } mb-2`}>
                    Inter-Cluster Distance
                  </p>
                  <p className={`text-2xl font-bold ${textClass}`}>
                    {qualityMetrics.quality_metrics.inter_cluster_distance?.toFixed(3) || 'N/A'}
                  </p>
                  <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
                    Higher = better separation
                  </p>
                </div>

                <div>
                  <p className={`text-xs uppercase tracking-wider ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  } mb-2`}>
                    Model Version
                  </p>
                  <p className={`text-2xl font-bold ${textClass}`}>
                    v{qualityMetrics.model_version}
                  </p>
                  <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
                    Current active model
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Version History */}
          {modelVersions.length > 0 && (
            <div className={`rounded-lg border ${borderClass} p-6 ${cardClass}`}>
              <h3 className={`text-lg font-semibold ${textClass} mb-4`}>Version History</h3>

              <div className="space-y-3 max-h-64 overflow-y-auto">
                {[...modelVersions].reverse().map((version) => (
                  <div
                    key={version.version}
                    className={`p-4 rounded border ${borderClass} ${
                      version.active
                        ? theme === 'dark'
                          ? 'bg-green-900 bg-opacity-10'
                          : 'bg-green-50'
                        : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className={`font-semibold ${textClass}`}>
                          Version {version.version}
                          {version.active && (
                            <span className="ml-2 inline-block px-2 py-1 text-xs bg-green-600 text-white rounded">
                              Active
                            </span>
                          )}
                        </p>
                        <p className={`text-sm ${
                          theme === 'dark'
                            ? 'text-gray-400'
                            : 'text-gray-600'
                        }`}>
                          {new Date(version.timestamp * 1000).toLocaleString()}
                        </p>
                        <p className={`text-xs ${
                          theme === 'dark'
                            ? 'text-gray-500'
                            : 'text-gray-500'
                        } mt-2`}>
                          {version.description}
                        </p>
                      </div>
                      <div className="text-right ml-4">
                        <p className={`text-sm ${textClass}`}>
                          {version.training_samples} samples
                        </p>
                        <p className={`text-xs ${
                          theme === 'dark'
                            ? 'text-gray-400'
                            : 'text-gray-600'
                        }`}>
                          {version.confirmed_people} people
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
