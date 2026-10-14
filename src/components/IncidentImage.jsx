import React, { useState, useEffect } from 'react';
import { getIncidentImageUrl, getCachedImageStatus, setCachedImageStatus } from '../utils/imageUtils';
import './IncidentImage.css';

/**
 * Robust IncidentImage component with:
 * - Backwards-compatible image URL resolution (photoUrl, imageUrl, photo, image)
 * - Anti-layout shift skeleton loading state
 * - Lazy loading & async decoding for optimal rendering performance
 * - In-memory URL status caching to avoid duplicate requests & re-fetch loops on re-renders
 * - Professional, non-broken graceful fallback when an image genuinely cannot be loaded
 * - Zero technical error exposure to end users
 */
const IncidentImage = ({
  incident,
  src,
  alt = 'Incident photo',
  className = '',
  fallbackText = 'Image unavailable',
  style
}) => {
  const imageUrl = src || getIncidentImageUrl(incident);

  const [status, setStatus] = useState(() => {
    if (!imageUrl) return 'empty';
    return getCachedImageStatus(imageUrl) || 'loading';
  });

  useEffect(() => {
    if (!imageUrl) {
      setStatus('empty');
      return;
    }
    const cached = getCachedImageStatus(imageUrl);
    setStatus(cached || 'loading');
  }, [imageUrl]);

  if (!imageUrl || status === 'empty') {
    return null;
  }

  if (status === 'error') {
    return (
      <div
        className={`incident-image-fallback ${className}`}
        style={style}
        role="img"
        aria-label={alt || 'Incident photo unavailable'}
      >
        <svg
          className="incident-image-fallback-icon"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 8H6.5L8 5H16L17.5 8H20C21.1 8 22 8.9 22 10V19C22 20.1 21.1 21 20 21H4C2.9 21 2 20.1 2 19V10C2 8.9 2.9 8 4 8Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="14.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="incident-image-fallback-text">{fallbackText}</span>
      </div>
    );
  }

  return (
    <div className="incident-image-wrapper">
      {status === 'loading' && (
        <div className={`incident-image-skeleton ${className}`} aria-hidden="true" />
      )}
      <img
        src={imageUrl}
        alt={alt}
        className={`incident-image-element ${className} ${status === 'loaded' ? 'is-loaded' : 'is-loading'}`}
        style={style}
        loading="lazy"
        decoding="async"
        onLoad={() => {
          setCachedImageStatus(imageUrl, 'loaded');
          setStatus('loaded');
        }}
        onError={() => {
          setCachedImageStatus(imageUrl, 'error');
          setStatus('error');
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[Alert24 Image] Failed to load incident image:', imageUrl);
          }
        }}
      />
    </div>
  );
};

export default IncidentImage;
