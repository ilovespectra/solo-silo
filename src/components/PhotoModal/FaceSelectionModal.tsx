'use client';
import { apiUrl } from '@/lib/api';

import { useState, useRef, useEffect } from 'react';
import { FaceCluster } from '../PeoplePane/hooks/useFaceClusters';
import DuplicateClusterDialog from './DuplicateClusterDialog';

interface DetectedFace {
  bbox: [number, number, number, number];
  confidence: number;
  index: number;
}

interface FaceMapping {
  faceIndex: number;
  clusterId?: string;
  newPersonName?: string;
}

interface ApiFaceData {
  bbox: [number, number, number, number];
  confidence?: number;
  score?: number;
}

interface FaceSelectionModalProps {
  isOpen: boolean;
  mediaId: string;
  imagePath: string;
  currentClusterId: string;
  currentClusterName: string;
  allClusters: FaceCluster[];
  onClose: () => void;
  onConfirm: (mappings: FaceMapping[]) => Promise<void>;
  theme?: 'dark' | 'light';
}

export default function FaceSelectionModal({
  isOpen,
  mediaId,
  imagePath,
  currentClusterId,
  currentClusterName,
  allClusters,
  onClose,
  onConfirm,
  theme = 'dark',
}: FaceSelectionModalProps) {
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [manualFaces, setManualFaces] = useState<DetectedFace[]>([]);
  const [imageData, setImageData] = useState<{width: number, height: number, rotation: number} | null>(null);
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number | null>(null);
  const [faceMapping, setFaceMapping] = useState<Map<number, FaceMapping>>(new Map());
  const [newPersonName, setNewPersonName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{name: string; clusterId: string; photoCount: number} | null>(null);
  const [clusterSearchQuery, setClusterSearchQuery] = useState('');
  const [localClusters, setLocalClusters] = useState<FaceCluster[]>(allClusters);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const refreshClusters = async () => {
      try {
        const response = await fetch(apiUrl('/api/faces/clusters?min_photos=0&_t=' + Date.now()), {
          cache: 'no-store',
        });
        if (response.ok) {
          const clusters = await response.json();
          setLocalClusters(clusters);
          console.log('[FaceSelectionModal] Refreshed clusters (min_photos=0):', clusters.length);
        }
      } catch (err) {
        console.warn('[FaceSelectionModal] Failed to refresh clusters:', err);
        setLocalClusters(allClusters);
      }
    };

    refreshClusters();
  }, [isOpen, allClusters]);

  const otherClusters = localClusters.filter((c) => c.id !== currentClusterId);
  
  const filteredClusters = otherClusters.filter((c) => {
    const clusterName = (c.name || `cluster ${c.id.slice(0, 8)}`).toLowerCase();
    return clusterName.includes(clusterSearchQuery.toLowerCase());
  });

  useEffect(() => {
    if (!isOpen) {
      setIsDrawingMode(false);
      setSelectedFaceIndex(null);
      return;
    }

    setIsDrawingMode(true);

    const loadImageAndFaces = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const numMediaId = parseInt(mediaId);
        
        const metadataRes = await fetch(`/api/media/${numMediaId}/metadata`);
        if (!metadataRes.ok) {
          throw new Error('failed to fetch image metadata');
        }
        const metadata = await metadataRes.json();
        
        const facesRes = await fetch(`/api/media/${numMediaId}/faces`);
        let faces: DetectedFace[] = [];
        
        if (facesRes.ok) {
          const facesData = await facesRes.json();
          faces = (facesData || []).map((face: ApiFaceData, index: number) => ({
            bbox: face.bbox || [0, 0, 0.5, 0.5],
            confidence: face.confidence || face.score || 0.9,
            index,
          }));
        }
        
        if (faces.length === 0) {
          console.warn('[FaceSelectionModal] No faces detected - allowing manual face drawing');
        }
        
        setDetectedFaces(faces);
        setImageData({
          width: metadata.width || 1000,
          height: metadata.height || 1000,
          rotation: metadata.rotation || 0,
        });
        
        console.log('[FaceSelectionModal] Loaded', faces.length, 'faces with rotation', metadata.rotation);
      } catch (err) {
        console.error('[FaceSelectionModal] Error loading image/faces:', err);
        setError(err instanceof Error ? err.message : 'Failed to load image');
      } finally {
        setIsLoading(false);
      }
    };

    loadImageAndFaces();
  }, [isOpen, mediaId]);

  useEffect(() => {
    if (!canvasRef.current || !imageData) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      console.log('[FaceSelectionModal] Image loaded successfully:', img.width, 'x', img.height);
      imageRef.current = img;
      
      canvas.width = img.width;
      canvas.height = img.height;
      
      console.log('[FaceSelectionModal] Canvas set to:', canvas.width, 'x', canvas.height);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      
      if (imageData.rotation && imageData.rotation !== 0) {
        const centerX = img.width / 2;
        const centerY = img.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate((imageData.rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }
      
      ctx.drawImage(img, 0, 0);
      
      ctx.restore();
      
      console.log('[FaceSelectionModal] image drawn on canvas');
      
      drawFaceBoxes(ctx, img.width, img.height);
      console.log('[FaceSelectionModal] drew', detectedFaces.length, 'face boxes');
    };
    
    img.onerror = (e) => {
      const errorMsg = `failed to load image from ${img.src}`;
      console.error('[FaceSelectionModal]', errorMsg, 'Error:', e);
      
      if (img.src.includes('/api/media/')) {
        console.log('[FaceSelectionModal] trying fallback to next.js proxy:', imagePath);
        img.src = imagePath;
      } else {
        setError(errorMsg);
      }
    };
    
    img.onabort = () => {
      console.warn('[FaceSelectionModal] image loading aborted');
    };
    
    const imageUrl = `/api/media/file/${parseInt(mediaId)}`;
    const fallbackUrl = imagePath;
    console.log('[FaceSelectionModal] loading image from:', imageUrl);
    console.log('[FaceSelectionModal] fallback image from:', fallbackUrl);
    console.log('[FaceSelectionModal] clusters loaded:', allClusters.length, 'clusters');
    allClusters.forEach(c => console.log(`  - ${c.id}: "${c.name || 'unnamed'}"`));
    img.src = imageUrl;
  }, [imageData, mediaId, imagePath, allClusters, detectedFaces.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canvasRef.current || !imageRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    if (imageData?.rotation && imageData.rotation !== 0) {
      const centerX = imageRef.current.width / 2;
      const centerY = imageRef.current.height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((imageData.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }
    
    ctx.drawImage(imageRef.current, 0, 0);
    ctx.restore();
    
    drawFaceBoxes(ctx, imageRef.current.width, imageRef.current.height);
  }, [selectedFaceIndex, imageData?.rotation, detectedFaces.length, manualFaces.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawFaceBoxes = (ctx: CanvasRenderingContext2D, imageWidth: number, imageHeight: number) => {
    detectedFaces.forEach((face) => {
      const [x1, y1, x2, y2] = face.bbox;
      
      const px1 = x1 * imageWidth;
      const py1 = y1 * imageHeight;
      const px2 = x2 * imageWidth;
      const py2 = y2 * imageHeight;
      
      const width = px2 - px1;
      const height = py2 - py1;
      
      const isSelected = face.index === selectedFaceIndex;
      
      ctx.strokeStyle = isSelected ? '#00ff00' : '#ffff00';
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.strokeRect(px1, py1, width, height);
      
      ctx.fillStyle = isSelected ? '#00ff00' : '#ffff00';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(`#${face.index}`, px1 + 5, py1 - 5);
      
      ctx.font = '12px Arial';
      ctx.fillText(`${(face.confidence * 100).toFixed(0)}%`, px1 + 5, py1 + height + 20);
    });

    manualFaces.forEach((face) => {
      const [x1, y1, x2, y2] = face.bbox;
      
      const px1 = x1 * imageWidth;
      const py1 = y1 * imageHeight;
      const px2 = x2 * imageWidth;
      const py2 = y2 * imageHeight;
      
      const width = px2 - px1;
      const height = py2 - py1;
      
      const isSelected = detectedFaces.length + face.index === selectedFaceIndex;
      
      ctx.strokeStyle = isSelected ? '#ff6600' : '#ffaa00';
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.strokeRect(px1, py1, width, height);
      
      ctx.fillStyle = isSelected ? '#ff6600' : '#ffaa00';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(`M${face.index}`, px1 + 5, py1 - 5);
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    if (isDrawingMode) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      setDrawStart({ x: x * scaleX, y: y * scaleY });
      setIsDrawing(true);
      setHasMoved(false);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !imageRef.current) return;

    if (isDrawingMode && hasMoved) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

    const clicked = detectedFaces.find((face) => {
      const [x1, y1, x2, y2] = face.bbox;
      const px1 = x1 * imageRef.current!.width;
      const py1 = y1 * imageRef.current!.height;
      const px2 = x2 * imageRef.current!.width;
      const py2 = y2 * imageRef.current!.height;

      return (
        canvasX >= px1 &&
        canvasX <= px2 &&
        canvasY >= py1 &&
        canvasY <= py2
      );
    });

    if (!clicked) {
      const clickedManual = manualFaces.find((face) => {
        const [x1, y1, x2, y2] = face.bbox;
        const px1 = x1 * imageRef.current!.width;
        const py1 = y1 * imageRef.current!.height;
        const px2 = x2 * imageRef.current!.width;
        const py2 = y2 * imageRef.current!.height;

        return (
          canvasX >= px1 &&
          canvasX <= px2 &&
          canvasY >= py1 &&
          canvasY <= py2
        );
      });
      
      if (clickedManual) {
        handleFaceSelect(detectedFaces.length + clickedManual.index);
        return;
      }
    }

    if (clicked) {
      handleFaceSelect(clicked.index);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode || !canvasRef.current || !drawStart || !isDrawing) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const currentX = x * scaleX;
    const currentY = y * scaleY;

    const movedX = Math.abs(currentX - drawStart.x);
    const movedY = Math.abs(currentY - drawStart.y);
    
    if (movedX > 5 || movedY > 5) {
      setHasMoved(true);
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || !imageRef.current) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    if (imageData?.rotation && imageData.rotation !== 0) {
      const centerX = imageRef.current.width / 2;
      const centerY = imageRef.current.height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((imageData.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }
    
    ctx.drawImage(imageRef.current, 0, 0);
    ctx.restore();
    
    drawFaceBoxes(ctx, imageRef.current.width, imageRef.current.height);

    const width = currentX - drawStart.x;
    const height = currentY - drawStart.y;
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.strokeRect(drawStart.x, drawStart.y, width, height);
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !drawStart || !imageRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const endX = x * scaleX;
    const endY = y * scaleY;

    if (hasMoved && Math.abs(endX - drawStart.x) > 20 && Math.abs(endY - drawStart.y) > 20) {
      const x1 = Math.min(drawStart.x, endX) / imageRef.current.width;
      const y1 = Math.min(drawStart.y, endY) / imageRef.current.height;
      const x2 = Math.max(drawStart.x, endX) / imageRef.current.width;
      const y2 = Math.max(drawStart.y, endY) / imageRef.current.height;

      const newFace: DetectedFace = {
        bbox: [x1, y1, x2, y2],
        confidence: 0.9,
        index: manualFaces.length,
      };
      const updated = [...manualFaces, newFace];
      setManualFaces(updated);
      const newFaceIndex = detectedFaces.length + newFace.index;
      setSelectedFaceIndex(newFaceIndex);
      console.log('[FaceSelectionModal] Added manual face:', newFace, 'Selected index:', newFaceIndex);
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx && imageRef.current) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      
      if (imageData?.rotation && imageData.rotation !== 0) {
        const centerX = imageRef.current.width / 2;
        const centerY = imageRef.current.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate((imageData.rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }
      
      ctx.drawImage(imageRef.current, 0, 0);
      ctx.restore();
      drawFaceBoxes(ctx, imageRef.current.width, imageRef.current.height);
    }

    setIsDrawing(false);
    setDrawStart(null);
    setHasMoved(false);
  };

  const handleFaceSelect = (index: number) => {
    setSelectedFaceIndex(index);
    setNewPersonName('');
  };

  const handleAssignToCluster = (clusterId: string) => {
    if (selectedFaceIndex === null) return;

    const newMapping = new Map(faceMapping);
    newMapping.set(selectedFaceIndex, { faceIndex: selectedFaceIndex, clusterId });
    setFaceMapping(newMapping);
    setSelectedFaceIndex(null);
  };

  const handleCreateNewPerson = async () => {
    if (selectedFaceIndex === null || !newPersonName.trim()) return;

    try {
      const checkResponse = await fetch(apiUrl('/api/faces/check-duplicate-name'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPersonName.trim() }),
      });

      if (!checkResponse.ok) throw new Error('Failed to check cluster name');
      const checkData = await checkResponse.json();

      if (checkData.exists) {
        setDuplicateInfo({
          name: checkData.cluster_name,
          clusterId: checkData.cluster_id,
          photoCount: checkData.photo_count,
        });
        setShowDuplicateDialog(true);
        return;
      }

      console.log('[FaceSelectionModal] Creating new cluster for:', newPersonName.trim());
      const createResponse = await fetch(apiUrl('/api/faces/create-cluster'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPersonName.trim() }),
      });
      
      if (!createResponse.ok) {
        const errData = await createResponse.json();
        throw new Error(errData.detail || `Failed to create cluster: ${newPersonName.trim()}`);
      }
      
      const createdCluster = await createResponse.json();
      console.log(`[FaceSelectionModal] Created cluster ${createdCluster.id}: ${newPersonName.trim()}`);
      
      const newClusterForUI: FaceCluster = {
        id: createdCluster.id,
        name: newPersonName.trim(),
        primary_thumbnail: '',
        photo_count: 0,
        confidence_score: 0,
        is_hidden: false,
        last_updated: Date.now(),
      };
      setLocalClusters(prev => [...prev, newClusterForUI]);
      console.log('[FaceSelectionModal] Added new cluster to localClusters:', createdCluster.id);
      
      const newMapping = new Map(faceMapping);
      newMapping.set(selectedFaceIndex, { 
        faceIndex: selectedFaceIndex, 
        clusterId: createdCluster.id
      });
      setFaceMapping(newMapping);
      setNewPersonName('');
      setSelectedFaceIndex(null);
    } catch (err) {
      console.error('Failed to create new person:', err);
      alert(`Failed to create ${newPersonName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleMergeClusters = async (targetClusterId: string) => {
    if (!selectedFaceIndex) return;

    try {
      const newMapping = new Map(faceMapping);
      newMapping.set(selectedFaceIndex, { 
        faceIndex: selectedFaceIndex, 
        clusterId: targetClusterId
      });
      setFaceMapping(newMapping);
      
      setShowDuplicateDialog(false);
      setDuplicateInfo(null);
      setNewPersonName('');
      setSelectedFaceIndex(null);
    } catch (err) {
      console.error('Failed to merge:', err);
      alert(`Failed to merge: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSubmit = async () => {
    if (faceMapping.size === 0) {
      alert('please assign at least one face to a person');
      return;
    }

    setIsSubmitting(true);
    try {
      console.log('[FaceSelectionModal] Submitting face mappings:', Array.from(faceMapping.values()));
      await onConfirm(Array.from(faceMapping.values()));
      console.log('[FaceSelectionModal] Submit successful, closing modal');
      onClose();
    } catch (error) {
      console.error('failed to assign faces:', error);
      const errorMsg = error instanceof Error ? error.message : 'unknown error';
      console.error('error details:', errorMsg);
      alert(`failed to assign faces: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div
          className={`${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          } rounded-lg shadow-2xl w-full max-w-5xl my-8`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`border-b ${
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
          } p-6 flex items-center justify-between`}>
            <h2 className={`text-2xl font-bold ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              select faces to assign
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-2"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-6 grid grid-cols-3 gap-6 max-h-[70vh]">
            {/* Canvas Area */}
            <div className="col-span-2 flex flex-col">
              {isLoading ? (
                <div className="bg-gray-900 rounded aspect-video flex items-center justify-center">
                  <p className="text-gray-400">loading image and detecting faces...</p>
                </div>
              ) : error ? (
                <div className="bg-red-900/20 rounded aspect-video flex items-center justify-center border border-red-600">
                  <p className="text-red-400">{error}</p>
                </div>
              ) : (
                <div className="bg-black rounded overflow-hidden flex-1 flex items-center justify-center border border-gray-700">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={handleCanvasMouseDown}
                    onClick={handleCanvasClick}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    className="max-w-full max-h-full cursor-pointer"
                    style={{ maxHeight: '500px', width: 'auto', height: 'auto', display: 'block' }}
                  />
                </div>
              )}

              {/* Instructions and drawing mode */}
              <div className="mt-4 space-y-3">
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {isDrawingMode
                    ? '✏️ drawing mode active - click and drag to draw a box around a face. Face is automatically highlighted when you release.'
                    : detectedFaces.length > 0 
                      ? '👆 Click on detected faces to select them. Selected faces are highlighted in bright color.'
                      : 'No faces detected'}
                </p>
                
                {/* drawing mode toggle button */}
                <button
                  onClick={() => {
                    setIsDrawingMode(!isDrawingMode);
                    setSelectedFaceIndex(null);
                  }}
                  className={`w-full px-3 py-2 rounded text-sm transition flex items-center justify-center gap-2 ${
                    isDrawingMode
                      ? theme === 'dark'
                        ? 'bg-orange-600 hover:bg-orange-700 text-white'
                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                      : theme === 'dark'
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                        : 'bg-gray-300 hover:bg-gray-400 text-gray-900'
                  }`}
                >
                  {isDrawingMode ? '✓ drawing mode' : '✎ Draw New Face'}
                  {manualFaces.length > 0 && (
                    <span className="text-xs bg-black/20 rounded px-2 py-1">
                      {manualFaces.length} drawn
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Assignment Panel */}
            <div className={`border rounded-lg p-4 flex flex-col max-h-[calc(70vh-280px)] ${
              theme === 'dark' ? 'border-gray-700 bg-gray-900' : 'border-gray-300 bg-gray-50'
            }`}>
              {selectedFaceIndex !== null ? (
                <>
                  <p className={`font-bold mb-4 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    {selectedFaceIndex < detectedFaces.length ? 'detected ' : 'manual '}face #{selectedFaceIndex}
                  </p>

                  {/* Delete button for manual faces */}
                  {selectedFaceIndex >= detectedFaces.length && (
                    <button
                      onClick={() => {
                        const manualIndex = selectedFaceIndex - detectedFaces.length;
                        const updated = manualFaces
                          .filter((_, i) => i !== manualIndex)
                          .map((face, i) => ({ ...face, index: i }));
                        setManualFaces(updated);
                        setSelectedFaceIndex(null);
                        if (canvasRef.current && imageRef.current) {
                          const ctx = canvasRef.current.getContext('2d');
                          if (ctx) {
                            ctx.drawImage(imageRef.current, 0, 0);
                            drawFaceBoxes(ctx, imageRef.current.width, imageRef.current.height);
                          }
                        }
                      }}
                      className="w-full px-3 py-2 rounded mb-3 bg-red-600/20 hover:bg-red-600/40 text-red-300 transition text-sm"
                    >
                      delete face
                    </button>
                  )}

                  {/* Scrollable cluster list */}
                  <div className="flex-1 min-h-0 overflow-y-auto mb-4 pr-2">
                    <div className="space-y-2">
                      {/* Current person */}
                      <button
                        onClick={() => handleAssignToCluster(currentClusterId)}
                        className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition ${
                          theme === 'dark'
                            ? 'bg-orange-600/20 hover:bg-orange-600/40 text-orange-300'
                            : 'bg-orange-100 hover:bg-orange-200 text-orange-900'
                        }`}
                      >
                        <div>{currentClusterName}</div>
                        <div className={`text-xs ${theme === 'dark' ? 'text-orange-200/60' : 'text-orange-700/60'}`}>(current)</div>
                      </button>

                      {/* Search existing clusters */}
                      {otherClusters.length > 0 && (
                        <input
                          type="text"
                          placeholder="search clusters..."
                          value={clusterSearchQuery}
                          onChange={(e) => setClusterSearchQuery(e.target.value)}
                          className={`w-full px-3 py-2 rounded mb-2 border text-sm ${
                            theme === 'dark'
                              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                          }`}
                        />
                      )}

                      {/* Other people - filtered by search */}
                      {filteredClusters.map((cluster) => (
                        <button
                          key={cluster.id}
                          onClick={() => handleAssignToCluster(cluster.id)}
                          className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                            theme === 'dark'
                              ? 'bg-purple-600/20 hover:bg-purple-600/40 text-purple-300'
                              : 'bg-purple-100 hover:bg-purple-200 text-purple-900'
                          }`}
                        >
                          <div>{cluster.name || `cluster ${cluster.id.slice(0, 8)}`}</div>
                          <div className={`text-xs ${theme === 'dark' ? 'text-purple-200/60' : 'text-purple-700/60'}`}>
                            {cluster.photo_count} photos
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* New person */}
                  <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'} pt-3`}>
                    <input
                      type="text"
                      placeholder="new person name..."
                      value={newPersonName}
                      onChange={(e) => setNewPersonName(e.target.value)}
                      className={`w-full px-3 py-2 rounded mb-2 border text-sm ${
                        theme === 'dark'
                          ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                      }`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateNewPerson();
                        }
                      }}
                    />
                    <button
                      onClick={handleCreateNewPerson}
                      disabled={!newPersonName.trim()}
                      className={`w-full px-3 py-2 rounded text-sm font-medium transition disabled:opacity-50 ${
                        theme === 'dark'
                          ? 'bg-green-600/20 hover:bg-green-600/40 text-green-300'
                          : 'bg-green-100 hover:bg-green-200 text-green-900'
                      }`}
                    >
                      + create new
                    </button>
                  </div>
                </>
              ) : (
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {detectedFaces.length > 0 ? 'select a face to assign it to a person' : 'no faces to assign'}
                </p>
              )}

              {/* Assignments Summary */}
              {faceMapping.size > 0 && (
                <div className={`border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'} pt-4 mt-4`}>
                  <p className={`text-xs font-bold mb-2 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-900'
                  }`}>
                    assignments: {faceMapping.size}/{detectedFaces.length + manualFaces.length}
                  </p>
                  <div className="space-y-1 text-xs overflow-y-auto max-h-24">
                    {Array.from(faceMapping.values()).map((mapping) => {
                      const isManual = mapping.faceIndex >= detectedFaces.length;
                      return (
                        <div key={mapping.faceIndex} className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                          {isManual ? '✏️' : '📸'} face #{mapping.faceIndex} → {
                            mapping.newPersonName 
                              ? `${mapping.newPersonName} (new)` 
                              : localClusters.find(c => c.id === mapping.clusterId)?.name || 'unknown'
                          }
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className={`border-t ${
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
          } p-6 flex gap-3 justify-end`}>
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                theme === 'dark'
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-100'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
              }`}
            >
              cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || faceMapping.size === 0}
              className="px-4 py-2 rounded-lg font-medium bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white transition"
            >
              {isSubmitting ? 'assigning...' : `assign ${faceMapping.size} Face${faceMapping.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>

      {/* Duplicate Cluster Dialog */}
      {duplicateInfo && (
        <DuplicateClusterDialog
          isOpen={showDuplicateDialog}
          duplicateName={duplicateInfo.name}
          duplicateClusterId={duplicateInfo.clusterId}
          clusterCount={duplicateInfo.photoCount}
          allClusters={localClusters}
          theme={theme}
          onMerge={handleMergeClusters}
          onCancel={() => {
            setShowDuplicateDialog(false);
            setDuplicateInfo(null);
          }}
        />
      )}
    </>
  );
}
