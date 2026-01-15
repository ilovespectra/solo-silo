'use client';

import { useState, useEffect, useRef } from 'react';

export interface PhotoModalProps {
  isOpen: boolean;
  media: {
    id: string;
    image_path: string | null;
    thumbnail: string;
    rotation?: number;
    name?: string;
  } | null;
  onClose: () => void;
  onConfirm?: () => void;
  onRemove?: () => void;
  onRotate?: (mediaId: string, rotation: number) => void;
  onToggleFavorite?: (mediaId: number) => void;
  isFavorite?: (mediaId: number) => boolean;
  children?: React.ReactNode;
  theme?: 'dark' | 'light';
}

function getFileExtension(media: PhotoModalProps['media']): string {
  if (!media) return '';
  const name = media.name || media.image_path || '';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ext;
}

function isVideoFile(extension: string): boolean {
  return ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'mkv', 'm4v'].includes(extension);
}

function isTextFile(extension: string): boolean {
  return ['txt', 'md', 'json', 'xml', 'csv', 'log', 'html', 'css', 'js', 'ts', 'py', 'sh', 'yml', 'yaml'].includes(extension);
}

function isImageFile(extension: string): boolean {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tiff'].includes(extension);
}

export default function BasePhotoModal({
  isOpen,
  media,
  onClose,
  onConfirm,
  onRemove,
  onRotate,
  onToggleFavorite,
  isFavorite,
  children,
}: PhotoModalProps) {
  const [rotation, setRotation] = useState(media?.rotation || 0);
  const [textContent, setTextContent] = useState<string>('');
  const [loadingText, setLoadingText] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [fullImageLoaded, setFullImageLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const fileExtension = getFileExtension(media);
  const isVideo = isVideoFile(fileExtension);
  const isText = isTextFile(fileExtension);
  const isImage = isImageFile(fileExtension);
  
  // Use thumbnail first for fast initial display, then load full image
  const displayUrl = media ? `/api/media/thumbnail/${media.id}?size=1000` : null;
  const fullImageUrl = media ? `/api/media/file/${media.id}` : null;
  
  useEffect(() => {
    if (isOpen && displayUrl) {
      console.log('[BasePhotoModal] Loading media:', { displayUrl, fullImageUrl, mediaId: media?.id });
    }
  }, [isOpen, displayUrl, fullImageUrl, media?.id]);
  
  useEffect(() => {
    if (media?.id && media?.rotation === undefined) {
      fetch(`/api/media/${media.id}/metadata`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.rotation !== undefined) {
            setRotation(data.rotation);
          }
        })
        .catch(err => console.error('Failed to load rotation:', err));
    }
  }, [media?.id, media?.rotation]);

  useEffect(() => {
    // Reset image loading state when media changes
    setImageLoading(true);
  }, [media?.id]);

  useEffect(() => {
    if (isText && media?.id) {
      const loadText = async () => {
        setLoadingText(true);
        try {
          const res = await fetch(`/api/media/file/${media.id}`);
          if (!res.ok) throw new Error('Failed to load text');
          const content = await res.text();
          setTextContent(content.substring(0, 10000));
        } catch (err) {
          console.error('Failed to load text content:', err);
          setTextContent('Error loading file content');
        } finally {
          setLoadingText(false);
        }
      };
      loadText();
    }
  }, [media?.id, isText]);

  if (!isOpen || !media) return null;

  const rotateRight = () => {
    const newRotation = (rotation + 90) % 360;
    setRotation(newRotation);
    fetch(`/api/media/${media.id}/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotation: newRotation }),
    })
      .then(() => {
        if (onRotate) {
          onRotate(media.id, newRotation);
        }
      })
      .catch(err => console.error('Failed to save rotation:', err));
  };

  const rotateLeft = () => {
    const newRotation = (rotation - 90 + 360) % 360;
    setRotation(newRotation);
    fetch(`/api/media/${media.id}/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotation: newRotation }),
    })
      .then(() => {
        if (onRotate) {
          onRotate(media.id, newRotation);
        }
      })
      .catch(err => console.error('Failed to save rotation:', err));
  };

  return (
    <>
      {/* Blur backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Content wrapper */}
        <div
          key={media.id}
          className="relative bg-secondary rounded-lg shadow-2xl flex flex-col w-full h-full max-w-4xl max-h-[90vh] overflow-hidden border border-primary"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 bg-orange-glow hover:bg-orange-primary text-primary p-2 rounded-full transition"
            title="Close (Esc)"
            style={{ backgroundColor: 'var(--orange-glow)' }}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* File type indicator */}
          <div className="absolute top-4 left-4 z-10 text-xs font-medium px-3 py-1 rounded-full bg-gray-700/80 text-gray-100">
            {fileExtension.toUpperCase()}
          </div>

          {/* Content container with rotation */}
          <div className="flex-1 flex items-center justify-center overflow-hidden relative bg-primary">
            {isVideo ? (
              <video
                ref={videoRef}
                src={displayUrl || undefined}
                className="max-w-full max-h-full object-contain"
                controls
                style={{
                  width: '100%',
                  height: '100%',
                }}
                onError={() => {
                  console.error('Failed to load video');
                }}
              />
            ) : isText ? (
              <div className="w-full h-full flex flex-col bg-gray-900 rounded">
                {loadingText ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-2"></div>
                      <p className="text-gray-400 text-sm">Loading text...</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Text toolbar */}
                    <div className="bg-gray-800 border-b border-gray-700 p-2 flex gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(textContent).catch(err => {
                            console.error('Failed to copy:', err);
                          });
                        }}
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100"
                        title="Copy to clipboard"
                      >
                        📋 Copy
                      </button>
                    </div>
                    {/* Text content */}
                    <pre className="flex-1 overflow-auto p-4 text-gray-200 text-sm font-mono whitespace-pre-wrap break-words">
                      {textContent}
                    </pre>
                    {textContent.length >= 9999 && (
                      <div className="bg-gray-800 border-t border-gray-700 p-2 text-xs text-gray-400 text-center">
                        Showing first 10,000 characters (file may be longer)
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center w-full h-full relative">
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary z-10">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-2"></div>
                      <p className="text-gray-400 text-sm">Loading image...</p>
                    </div>
                  </div>
                )}
                {/* Rotated image container - only the image is rotated, not the text */}
                <div
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transition: 'transform 0.2s ease',
                  }}
                  className="flex items-center justify-center w-full h-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayUrl || undefined}
                    alt="Media"
                    className="max-w-full max-h-full object-contain"
                    onLoad={(e) => {
                      setImageLoading(false);
                      // If this is the thumbnail, start loading the full image
                      if (displayUrl?.includes('thumbnail') && fullImageUrl && !fullImageLoaded) {
                        const fullImg = new Image();
                        fullImg.src = fullImageUrl;
                        fullImg.onload = () => {
                          setFullImageLoaded(true);
                          e.currentTarget.src = fullImageUrl;
                        };
                        fullImg.onerror = () => {
                          // Full image failed, stick with thumbnail
                          console.log('[PhotoModal] Full image failed to load, using thumbnail');
                        };
                      }
                    }}
                    onError={(e) => {
                      setImageLoading(false);
                      if (media?.thumbnail && e.currentTarget.src !== media.thumbnail) {
                        e.currentTarget.src = media.thumbnail;
                      }
                    }}
                  />
                </div>
              </div>
            )}
            {/* Favorite button */}
            {onToggleFavorite && media && media.id && (
              <button
                onClick={() => {
                  console.log('[BasePhotoModal] Favorite button: media.id raw value:', JSON.stringify(media.id), 'type:', typeof media.id);
                  const id = parseInt(media.id);
                  console.log('[BasePhotoModal] Favorite button: parsed id:', id, 'isNaN:', isNaN(id));
                  if (isNaN(id) || typeof id !== 'number') {
                    console.error('[PhotoModal] PREVENTED invalid favorite call: media.id=', JSON.stringify(media.id));
                    return;
                  }
                  console.log('[BasePhotoModal] Calling onToggleFavorite with id:', id, 'type:', typeof id);
                  onToggleFavorite(id);
                }}
                className="absolute bottom-4 right-4 z-20 transition-all duration-200 hover:scale-125 flex items-center justify-center"
                title={isFavorite && isFavorite(parseInt(media.id)) ? "remove favorite" : "add to favorites"}
                style={{
                  width: '48px',
                  height: '48px',
                  backgroundColor: isFavorite && isFavorite(parseInt(media.id)) ? 'rgba(249, 115, 22, 0.7)' : 'rgba(107, 114, 128, 0.3)',
                  borderRadius: '50%',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                  filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))',
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill={isFavorite && isFavorite(parseInt(media.id)) ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    color: isFavorite && isFavorite(parseInt(media.id)) ? '#f59e0b' : '#d1d5db',
                    opacity: isFavorite && isFavorite(parseInt(media.id)) ? 1 : 0.5,
                  }}
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            )}

            {/* Rotation controls - only for images */}
            {isImage && (
              <div className="absolute bottom-4 left-4 flex gap-2 z-10">
                <button
                  onClick={rotateLeft}
                  className="text-primary p-2 rounded transition border border-primary"
                  title="Rotate Left"
                  style={{ backgroundColor: 'var(--orange-glow)' }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <button
                  onClick={rotateRight}
                  className="text-primary p-2 rounded transition border border-primary"
                  title="Rotate Right"
                  style={{ backgroundColor: 'var(--orange-glow)' }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Action buttons footer */}
          <div className="bg-secondary border-t border-primary p-4 flex items-center justify-between">
            <div className="flex gap-2">
              {onRemove && (
                <button
                  onClick={onRemove}
                  className="bg-red-600/20 hover:bg-red-600/40 text-red-300 px-4 py-2 rounded transition"
                  title="Remove"
                  style={{ 
                    backgroundColor: 'var(--border-error)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  ✕ Remove
                </button>
              )}
            </div>

            <div className="flex gap-2 items-center">
              {/* Custom actions from children */}
              {children}

              {onConfirm && (
                <button
                  onClick={onConfirm}
                  className="bg-orange-600/20 hover:bg-orange-600/40 text-orange-300 px-4 py-2 rounded transition"
                  title="Confirm"
                  style={{ 
                    backgroundColor: 'var(--orange-glow)',
                    color: 'var(--text-primary)'
                  }}
                >
                  ☑ Confirm
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
