import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import IncidentImage from './IncidentImage';
import { setCachedImageStatus } from '../utils/imageUtils';

describe('IncidentImage Component', () => {
  test('renders nothing when incident has no image and no src is provided', () => {
    const { container } = render(<IncidentImage incident={{ type: 'Fire' }} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders skeleton and image with lazy loading attributes', () => {
    const { container } = render(
      <IncidentImage
        incident={{ photoUrl: 'https://example.com/incident1.jpg' }}
        alt="Emergency Incident"
        className="test-class"
      />
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/incident1.jpg');
    expect(img).toHaveAttribute('alt', 'Emergency Incident');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(img.className).toContain('test-class');

    // Skeleton is present during loading
    const skeleton = container.querySelector('.incident-image-skeleton');
    expect(skeleton).toBeInTheDocument();
  });

  test('removes skeleton and marks loaded on successful image load', () => {
    const { container } = render(
      <IncidentImage
        src="https://example.com/valid-image.jpg"
        alt="Valid Photo"
      />
    );

    const img = screen.getByRole('img');
    fireEvent.load(img);

    expect(img.className).toContain('is-loaded');
    const skeleton = container.querySelector('.incident-image-skeleton');
    expect(skeleton).not.toBeInTheDocument();
  });

  test('renders professional fallback on image load error without technical error text', () => {
    const { container } = render(
      <IncidentImage
        src="https://example.com/broken-image.jpg"
        alt="Broken Photo"
        className="test-incident-img"
        fallbackText="Image unavailable"
      />
    );

    const img = screen.getByRole('img');
    fireEvent.error(img);

    // Fallback UI appears
    expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    // <img> element is gone and replaced by fallback
    expect(container.querySelector('img')).toBeNull();
  });

  test('uses cached error status immediately to avoid duplicate failing requests', () => {
    setCachedImageStatus('https://example.com/cached-broken.jpg', 'error');

    const { container } = render(
      <IncidentImage
        src="https://example.com/cached-broken.jpg"
        fallbackText="Image unavailable"
      />
    );

    // Shows fallback directly without rendering <img>
    expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
