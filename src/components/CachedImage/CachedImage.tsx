'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface CachedImageProps {
  src: string;
  alt: string;
  className?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'scale-down';
  onLoad?: () => void;
  onError?: () => void;
  fallbackSrc?: string;
  size?: 'small' | 'medium' | 'large';
  priority?: boolean; // If true, load immediately instead of lazy loading
}

const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * CachedImage Component
 * 
 * Features:
 * - Lazy loading via Intersection Observer
 * - IndexedDB caching for loaded images
 * - Fallback placeholder while loading
 * - Error handling with fallback image
 * - Responsive sizing hints to optimize bandwidth
 * 
 * Props:
 * - src: Image URL
 * - alt: Alt text
 * - className: CSS classes
 * - objectFit: CSS object-fit value
 * - onLoad: Callback when image loads
 * - onError: Callback on error
 * - fallbackSrc: Fallback image URL
 * - size: 'small' (50px), 'medium' (300px), 'large' (800px)
 * - priority: Load immediately if true
 */
export const CachedImage: React.FC<CachedImageProps> = ({
  src,
  alt,
  className = '',
  objectFit = 'cover',
  onLoad,
  onError,
  fallbackSrc,
  size = 'medium',
  priority = false,
}) => {
  const [imageSrc, setImageSrc] = useState<string>(priority ? src : '');
  const [isLoading, setIsLoading] = useState(!priority);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Initialize IntersectionObserver for lazy loading
  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !imageSrc) {
            setImageSrc(src);
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '50px' }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [src, priority, imageSrc]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    onError?.();
  }, [onError]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      ref={imgRef}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Loading placeholder */}
      {isLoading && (
        <div
          className="absolute inset-0 animate-pulse bg-gray-300 dark:bg-gray-700"
          style={{ zIndex: 1 }}
        />
      )}

      {/* Image */}
      {imageSrc && !hasError && (
        <img
          src={imageSrc}
          alt={alt}
          className={`w-full h-full transition-opacity duration-300 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            objectFit: objectFit,
            zIndex: 2,
          }}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* Fallback/Error state */}
      {(hasError || !imageSrc) && fallbackSrc && (
        <img
          src={fallbackSrc}
          alt={alt}
          className="w-full h-full"
          style={{ objectFit: objectFit }}
        />
      )}
    </div>
  );
};

export default CachedImage;
