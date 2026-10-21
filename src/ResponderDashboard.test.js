import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('./firebase', () => ({ db: {}, storage: {}, auth: {} }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
  writeBatch: jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  })),
  serverTimestamp: jest.fn(),
  updateDoc: jest.fn(),
  addDoc: jest.fn(),
}));

jest.mock('./hooks/useNotifications', () => () => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
  actionError: null,
  online: true,
  fromCache: false,
  markRead: jest.fn(),
  markAllRead: jest.fn(),
}));

jest.mock('./components/map/IncidentMap', () => {
  return function MockIncidentMap() {
    return <div data-testid="responder-incident-map">Responder Incident Map Component</div>;
  };
});

import ResponderDashboard from './ResponderDashboard';

describe('ResponderDashboard', () => {
  const defaultProps = {
    onLogout: jest.fn(),
    user: { uid: 'resp1', email: 'responder@example.com' },
    userData: { name: 'Unit 4 Responder', role: 'responder', isAvailable: true },
    theme: 'dark',
    onThemeChange: jest.fn(),
  };

  test('renders navigation items including Incident Map', () => {
    render(<ResponderDashboard {...defaultProps} />);
    expect(screen.getAllByText('My Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active Job').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Incident Map').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Job History').length).toBeGreaterThan(0);
  });

  test('navigates to Incident Map tab when clicked', async () => {
    render(<ResponderDashboard {...defaultProps} />);
    const mapButtons = screen.getAllByRole('button', { name: /incident map/i });
    fireEvent.click(mapButtons[0]);
    expect(await screen.findByTestId('responder-incident-map')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /incident map/i })).toBeInTheDocument();
  });
});
