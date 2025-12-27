'use client';

import { useEffect, useState } from 'react';
import { useSilos } from '@/hooks/useSilos';
import {
  fetchUncertainDetections,
  countUncertainDetections,
  reviewDetection,
  batchReviewDetections,
} from '@/lib/backend';

interface Detection {
  id: number;
  media_id: number;
  detection_type: string;
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number];
  reviewed: boolean;
  approved?: boolean;
  user_label?: string;
  media_path: string;
}

interface Counts {
  total: number;
  by_type: Record<string, number>;
}

export default function UncertainDetectionsReview() {
  const { activeSilo } = useSilos();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('animal');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<number>>(new Set());

  const loadDetections = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUncertainDetections(selectedType, false, 100, 0, activeSilo?.name);
      setDetections(data);
      setCurrentIndex(0);

      const countsData = await countUncertainDetections(activeSilo?.name);
      setCounts(countsData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load detections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetections();
  }, [selectedType, activeSilo?.name]);

  const handleReview = async (id: number, approved: boolean, label?: string) => {
    try {
      await reviewDetection(id, approved, label, activeSilo?.name);
      setDetections(detections.filter((d) => d.id !== id));
      if (currentIndex >= detections.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
      setCounts((prev: Counts | null) => {
        if (!prev) return null;
        return {
          ...prev,
          total: Math.max(0, prev.total - 1),
          by_type: {
            ...prev.by_type,
            [selectedType]: Math.max(0, (prev.by_type[selectedType] || 1) - 1),
          },
        };
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'failed to review detection');
    }
  };

  const handleBatchReview = async (approved: boolean) => {
    if (selectedForBatch.size === 0) return;

    try {
      const reviewData = Array.from(selectedForBatch).map((id) => ({
        id,
        approved,
      }));
      await batchReviewDetections(reviewData, activeSilo?.name);

      setDetections(
        detections.filter((d) => !selectedForBatch.has(d.id))
      );
      setSelectedForBatch(new Set());
      setCounts((prev: Counts | null) => {
        if (!prev) return null;
        return {
          ...prev,
          total: Math.max(0, prev.total - selectedForBatch.size),
          by_type: {
            ...prev.by_type,
            [selectedType]: Math.max(
              0,
              (prev.by_type[selectedType] || 0) - selectedForBatch.size
            ),
          },
        };
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to batch review');
    }
  };

  const toggleBatchSelect = (id: number) => {
    const newSelected = new Set(selectedForBatch);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedForBatch(newSelected);
  };

  const current = detections[currentIndex];

  return (
    <div className="p-4 overflow-auto w-full h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          review uncertain detections
        </h2>
        {counts && (
          <p className="text-sm text-gray-600">
            total unreviewed: {counts.total}
            {counts.by_type.animal && ` (animals: ${counts.by_type.animal})`}
          </p>
        )}
      </div>

      {/* Type selector */}
      <div className="mb-4 flex gap-2">
        {['animal', 'face'].map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`px-4 py-2 rounded font-medium transition ${
              selectedType === type
                ? 'bg-orange-600 text-white'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
            }`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
            {counts?.by_type[type] && (
              <span className="ml-2 text-xs opacity-75">({counts.by_type[type]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Mode toggle */}
      <div className="mb-4">
        <button
          onClick={() => setBatchMode(!batchMode)}
          className={`px-4 py-2 rounded font-medium transition ${
            batchMode
              ? 'bg-purple-600 text-white'
              : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
          }`}
        >
          {batchMode ? 'Exit Batch Mode' : 'Batch Review'}
        </button>
        {batchMode && selectedForBatch.size > 0 && (
          <div className="ml-4 inline-block">
            <span className="text-sm text-gray-700">
              selected: {selectedForBatch.size}
            </span>
            <button
              onClick={() => handleBatchReview(true)}
              className="ml-3 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              approve all
            </button>
            <button
              onClick={() => handleBatchReview(false)}
              className="ml-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
            >
              reject all
            </button>
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-gray-700">loading...</p>}
      {error && <p className="text-sm text-red-700 mb-4">{error}</p>}

      {detections.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-lg text-gray-600">
            {loading ? 'loading...' : 'no uncertain detections to review'}
          </p>
        </div>
      ) : batchMode ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {detections.map((detection) => (
            <div
              key={detection.id}
              className={`border-2 rounded-lg p-3 cursor-pointer transition ${
                selectedForBatch.has(detection.id)
                  ? 'border-purple-600 bg-purple-50'
                  : 'border-gray-300 bg-white hover:border-purple-400'
              }`}
              onClick={() => toggleBatchSelect(detection.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">
                    {detection.class_name}
                  </p>
                  <p className="text-xs text-gray-600">
                    {(detection.confidence * 100).toFixed(1)}% confidence
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={selectedForBatch.has(detection.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleBatchSelect(detection.id);
                  }}
                  className="w-4 h-4"
                />
              </div>
              {detection.media_path && (
                <div className="w-full h-32 bg-gray-100 rounded overflow-hidden">
                  <img
                    src={detection.media_path}
                    alt="detected item"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {current && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  {current.media_path && (
                    <div className="w-full bg-gray-100 rounded-lg overflow-hidden">
                      <img
                        src={current.media_path}
                        alt="media"
                        className="w-full h-auto"
                      />
                    </div>
                  )}
                </div>

                {/* Detection details and controls */}
                <div className="flex flex-col">
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      {current.class_name}
                    </h3>
                    <p className="text-lg text-gray-600 mb-4">
                      confidence: {(current.confidence * 100).toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-500">
                      detection {currentIndex + 1} of {detections.length}
                    </p>
                  </div>

                  <p className="text-gray-700 mb-6">
                    does this {current.detection_type} belong in this image?
                  </p>

                  {/* Action buttons */}
                  <div className="flex gap-3 mb-6">
                    <button
                      onClick={() => handleReview(current.id, true)}
                      className="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition"
                    >
                      ✓ yes, include
                    </button>
                    <button
                      onClick={() => handleReview(current.id, false)}
                      className="flex-1 px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition"
                    >
                      ✗ no, remove
                    </button>
                  </div>

                  {/* Optional label input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      custom label (optional):
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., 'German Shepherd', 'Cat - outdoor'"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleReview(
                            current.id,
                            true,
                            (e.target as HTMLInputElement).value
                          );
                        }
                      }}
                    />
                  </div>

                  {/* Navigation */}
                  <div className="mt-6 flex gap-2">
                    <button
                      onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                      disabled={currentIndex === 0}
                      className="px-4 py-2 bg-gray-300 text-gray-900 rounded disabled:opacity-50"
                    >
                      ←
                    </button>
                    <button
                      onClick={() =>
                        setCurrentIndex(
                          Math.min(detections.length - 1, currentIndex + 1)
                        )
                      }
                      disabled={currentIndex === detections.length - 1}
                      className="px-4 py-2 bg-gray-300 text-gray-900 rounded disabled:opacity-50"
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
