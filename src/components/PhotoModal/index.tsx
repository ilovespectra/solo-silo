'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';

interface Face {
  bbox: number[];
  score: number;
}

interface PhotoData {
  id: number;
  path: string;
  type: string;
  date_taken?: number;
  size?: number;
  faces?: string;
}

interface FaceLabel {
  [key: string]: string;
}

interface PhotoModalProps {
  selectedMediaId?: number | null;
  onClose?: () => void;
}

export default function PhotoModal({ selectedMediaId: propSelectedMediaId, onClose }: PhotoModalProps = {}) {
  const { selectedMediaId: storeSelectedMediaId, setSelectedMediaId, addFavorite, removeFavorite, isFavorite, theme } = useAppStore();
  const selectedMediaId = propSelectedMediaId !== undefined ? propSelectedMediaId : storeSelectedMediaId;
  const [photoData, setPhotoData] = useState<PhotoData | null>(null);
  const [faces, setFaces] = useState<Face[]>([]);
  const [selectedFaceIdx, setSelectedFaceIdx] = useState<number | null>(null);
  const [faceLabels, setFaceLabels] = useState<FaceLabel>({});
  const [renamingFace, setRenamingFace] = useState<number | null>(null);
  const [newFaceName, setNewFaceName] = useState('');
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!selectedMediaId) return;

    const fetchPhoto = async () => {
      try {
        const photoRes = await fetch(`http://127.0.0.1:8000/api/media/${selectedMediaId}`);
        if (!photoRes.ok) {
          throw new Error(`Failed to fetch photo: ${photoRes.statusText}`);
        }
        const photo = await photoRes.json();
        setPhotoData(photo);

        if (photo.faces) {
          try {
            const parsedFaces = JSON.parse(photo.faces);
            setFaces(Array.isArray(parsedFaces) ? parsedFaces : []);
          } catch (e) {
            console.error('Failed to parse faces:', e);
            setFaces([]);
          }
        } else {
          setFaces([]);
        }
        
        try {
          const metadataRes = await fetch(`http://127.0.0.1:8000/api/media/${selectedMediaId}/metadata`);
          if (metadataRes.ok) {
            const metadata = await metadataRes.json();
            setRotation(metadata.rotation || 0);
          }
        } catch (err) {
          console.error('Failed to load rotation metadata:', err);
          setRotation(0);
        }
      } catch (err) {
        console.error('Failed to fetch photo:', err);
        setPhotoData(null);
        setFaces([]);
      }
    };

    fetchPhoto();
  }, [selectedMediaId]);

  if (!selectedMediaId || !photoData) {
    return null;
  }

  const handleRenameFace = async (faceIdx: number, name: string) => {
    setFaceLabels({
      ...faceLabels,
      [faceIdx]: name,
    });
    setRenamingFace(null);
    setSelectedFaceIdx(null);
  };

  const toggleFavorite = () => {
    if (isFavorite(selectedMediaId)) {
      removeFavorite(selectedMediaId);
    } else {
      addFavorite(selectedMediaId);
    }
  };

  const handleRotatePhoto = async (direction: 'cw' | 'ccw') => {
    let next = rotation + (direction === 'cw' ? 90 : -90);
    if (next < 0) next = 270;
    if (next >= 360) next = 0;
    
    setRotation(next);
    
    try {
      await fetch(`/api/media/${selectedMediaId}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotation: next }),
      });
    } catch (err) {
      console.error('Failed to save rotation:', err);
    }
  };

  const bgClass = theme === 'dark' ? 'bg-gray-900' : 'bg-white';
  const textClass = theme === 'dark' ? 'text-white' : 'text-gray-900';
  const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className={`${bgClass} rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${borderClass}`}>
          <div className="flex-1">
            <h2 className={`text-lg font-semibold ${textClass}`}>
              {photoData.path.split('/').pop()}
            </h2>
            {faces.length > 0 && (
              <p className="text-xs text-gray-500">{faces.length} face(s) detected</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRotatePhoto('ccw')}
              className={`px-2 py-1 rounded text-sm font-medium transition ${
                theme === 'dark'
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
              }`}
              title="Rotate left"
            >
              ↶
            </button>
            <button
              onClick={() => handleRotatePhoto('cw')}
              className={`px-2 py-1 rounded text-sm font-medium transition ${
                theme === 'dark'
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
              }`}
              title="Rotate right"
            >
              ↷
            </button>
            <button
              onClick={toggleFavorite}
              className="transition-all duration-200 hover:scale-125 flex items-center justify-center"
              title={isFavorite(selectedMediaId) ? 'Remove favorite' : 'Add favorite'}
              style={{
                width: '32px',
                height: '32px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill={isFavorite(selectedMediaId) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" style={{ color: isFavorite(selectedMediaId) ? '#f59e0b' : '#9ca3af' }}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
            <button
              onClick={onClose ? onClose : () => setSelectedMediaId(null)}
              className={`px-3 py-1 rounded text-sm font-medium ${
                theme === 'dark'
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
              }`}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 flex gap-6">
          {/* Image */}
          <div className="flex-1 flex items-center justify-center bg-gray-100">
            <div className="relative" style={{ transform: `rotate(${rotation}deg)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`http://127.0.0.1:8000/api/media/file/${photoData.id}`}
                alt="Photo"
                className="max-w-full max-h-[70vh] object-contain transition-transform"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23e5e7eb" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%236b7280" font-size="20"%3E?%3C/text%3E%3C/svg%3E';
                }}
              />
              {/* face detection Overlays */}
              {faces.length > 0 && (
                <svg
                  className="absolute inset-0 w-full h-full"
                  style={{ pointerEvents: 'none' }}
                >
                  {faces.map((face, idx) => {
                    const [x1, y1, x2, y2] = face.bbox;
                    const width = x2 - x1;
                    const height = y2 - y1;
                    const isSelected = selectedFaceIdx === idx;

                    return (
                      <g key={idx} style={{ pointerEvents: 'auto' }}>
                        <rect
                          x={x1}
                          y={y1}
                          width={width}
                          height={height}
                          fill="none"
                          stroke={isSelected ? '#3b82f6' : '#fbbf24'}
                          strokeWidth="3"
                          className="cursor-pointer transition"
                          onClick={() => setSelectedFaceIdx(isSelected ? null : idx)}
                        />
                        <text
                          x={x1 + 5}
                          y={y1 - 5}
                          fill={isSelected ? '#3b82f6' : '#fbbf24'}
                          fontSize="12"
                          fontWeight="bold"
                          className="cursor-pointer"
                          onClick={() => setSelectedFaceIdx(isSelected ? null : idx)}
                        >
                          {faceLabels[idx] || `Face ${idx + 1}`}
                        </text>
                        {/* Confidence badge */}
                        <text
                          x={x1 + 5}
                          y={y2 + 15}
                          fill={isSelected ? '#3b82f6' : '#6b7280'}
                          fontSize="10"
                          className="cursor-pointer"
                        >
                          {(face.score * 100).toFixed(0)}%
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className={`w-64 flex flex-col gap-4 border-l ${borderClass} pl-6`}>
            {/* Photo Info */}
            <div>
              <h3 className={`text-sm font-semibold ${textClass} mb-2`}>Photo Info</h3>
              <div className={`text-xs space-y-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                <p className="font-mono text-xs break-all">
                  {photoData.path.split('/').pop() || photoData.path}
                </p>
                <p className="text-[10px] opacity-60">
                  {photoData.path}
                </p>
                {photoData.date_taken && (
                  <p>Taken: {new Date(photoData.date_taken * 1000).toLocaleDateString()}</p>
                )}
                {photoData.size && (
                  <p>Size: {(photoData.size / 1024 / 1024).toFixed(2)} MB</p>
                )}
              </div>
            </div>

            {/* Face Management */}
            {faces.length > 0 && (
              <div>
                <h3 className={`text-sm font-semibold ${textClass} mb-2`}>Detected Faces</h3>
                <div className="space-y-2">
                  {faces.map((face, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded border cursor-pointer transition ${
                        selectedFaceIdx === idx
                          ? 'bg-orange-50 border-orange-300'
                          : `${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`
                      }`}
                      onClick={() => setSelectedFaceIdx(selectedFaceIdx === idx ? null : idx)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-semibold ${textClass}`}>
                          {faceLabels[idx] || `Face ${idx + 1}`}
                        </span>
                        <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          {(face.score * 100).toFixed(0)}%
                        </span>
                      </div>

                      {selectedFaceIdx === idx && (
                        <div className="space-y-2 mt-2 pt-2 border-t border-gray-300">
                          {renamingFace === idx ? (
                            <input
                              type="text"
                              value={newFaceName}
                              onChange={(e) => setNewFaceName(e.target.value)}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  handleRenameFace(idx, newFaceName);
                                }
                              }}
                              placeholder="Enter name..."
                              className={`w-full px-2 py-1 text-xs rounded border ${
                                theme === 'dark'
                                  ? 'bg-gray-700 border-gray-600 text-white'
                                  : 'bg-white border-gray-300 text-gray-900'
                              }`}
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setRenamingFace(idx);
                                setNewFaceName(faceLabels[idx] || '');
                              }}
                              className="w-full px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 transition"
                            >
                              {faceLabels[idx] ? 'Rename' : 'Name Person'}
                            </button>
                          )}

                          <button className="w-full px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition">
                            Hide This Face
                          </button>

                          <button className="w-full px-2 py-1 text-xs bg-pink-600 text-white rounded hover:bg-pink-700 transition">
                            ♥ Love This Face
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Favorite */}
            {faces.length === 0 && (
              <div>
                <button
                  onClick={toggleFavorite}
                  className={`w-full px-3 py-2 rounded font-medium text-sm transition flex items-center justify-center gap-2 ${
                    isFavorite(selectedMediaId)
                      ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                      : `${theme === 'dark' ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-900 hover:bg-gray-300'}`
                  }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorite(selectedMediaId) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" style={{ color: 'inherit' }}>
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  <span>{isFavorite(selectedMediaId) ? 'Favorited' : 'Add to Favorites'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
