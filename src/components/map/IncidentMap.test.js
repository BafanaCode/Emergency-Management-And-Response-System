import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

let mockTileHandlers = {};

// react-leaflet ships as ESM, which Jest (CRA) does not transform. The mock keeps the
// test focused on Alert24's own logic: which incidents are plotted, popup content,
// and the degraded states. Real map rendering is verified in a browser.
jest.mock('react-leaflet', () => {
  const React = require('react');
  return {
    MapContainer: ({ children, ...rest }) => (
      <div data-testid="map" aria-label={rest['aria-label']}>{children}</div>
    ),
    TileLayer: ({ eventHandlers }) => {
      mockTileHandlers = eventHandlers || {};
      return <div data-testid="tiles" />;
    },
    Marker: ({ children, title }) => <div data-testid="marker" title={title}>{children}</div>,
    Popup: ({ children }) => <div data-testid="popup">{children}</div>,
    useMap: () => ({
      getContainer: () => global.document.createElement('div'),
      invalidateSize: jest.fn(),
      setView: jest.fn(),
      fitBounds: jest.fn(),
    }),
  };
});

import IncidentMap from './IncidentMap';

const base = {
  type: 'Fire',
  severity: 'Critical',
  status: 'Reported',
  address: '1 Main Street',
  reporterName: 'Secret Reporter Name',
  reporterId: 'rep-private-id',
};

const incidents = [
  { ...base, incidentId: 'a', latitude: -26.2, longitude: 28.04 },
  { ...base, incidentId: 'b', type: 'Flood', severity: 'Minor', status: 'Resolved', latitude: -33.9, longitude: 18.4 },
  { ...base, incidentId: 'c', address: 'Address only, no coordinates' },
  { ...base, incidentId: 'd', latitude: 999, longitude: 1 },
];

describe('IncidentMap', () => {
  beforeEach(() => {
    mockTileHandlers = {};
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  test('plots only incidents with valid coordinates and reports how many are missing', () => {
    render(<IncidentMap incidents={incidents} formatDate={() => 'today'} />);
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
    expect(screen.getByText(/2 without coordinates/i)).toBeInTheDocument();
  });

  test('popup shows useful details but never private reporter data', () => {
    render(<IncidentMap incidents={[incidents[0]]} formatDate={() => '01 Jan 2026 10:00'} />);
    const popup = within(screen.getByTestId('popup'));
    expect(popup.getByText('Fire')).toBeInTheDocument();
    expect(popup.getByText('1 Main Street')).toBeInTheDocument();
    expect(popup.getByText('Critical')).toBeInTheDocument();
    expect(screen.queryByText(/Secret Reporter Name/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('rep-private-id');
  });

  test('view and assign callbacks receive the selected incident; resolved incidents cannot be assigned', () => {
    const onView = jest.fn();
    const onAssign = jest.fn();
    render(
      <IncidentMap incidents={incidents} formatDate={() => ''} onViewIncident={onView} onAssignIncident={onAssign} />
    );
    fireEvent.click(screen.getAllByText('View details')[0]);
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ incidentId: 'a' }));
    // Only the 'Reported' incident offers Assign
    const assignButtons = screen.getAllByText('Assign');
    expect(assignButtons).toHaveLength(1);
    fireEvent.click(assignButtons[0]);
    expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ incidentId: 'a' }));
  });

  test('shows an explanatory empty state when nothing has coordinates', () => {
    render(<IncidentMap incidents={[incidents[2]]} formatDate={() => ''} />);
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
    expect(screen.getByText(/No incidents with coordinates yet/i)).toBeInTheDocument();
    expect(screen.getByText(/never guessed/i)).toBeInTheDocument();
  });

  test('warns when map tiles repeatedly fail to load', () => {
    render(<IncidentMap incidents={incidents} formatDate={() => ''} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    act(() => {
      mockTileHandlers.tileerror();
      mockTileHandlers.tileerror();
      mockTileHandlers.tileerror();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/tiles could not be loaded/i);
  });

  test('warns when the browser goes offline', () => {
    render(<IncidentMap incidents={incidents} formatDate={() => ''} />);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/offline/i);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
