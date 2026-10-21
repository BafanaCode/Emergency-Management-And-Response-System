import React from 'react';
import { render, screen, act } from '@testing-library/react';

// Mock Recharts to render testable DOM elements
jest.mock('recharts', () => {
  const Stub = ({ children, dataKey, data }) => (
    <div data-testid="recharts-stub" data-datakey={dataKey}>
      {data && <div data-testid="recharts-data">{JSON.stringify(data)}</div>}
      {children}
    </div>
  );
  return {
    ResponsiveContainer: Stub,
    LineChart: Stub,
    Line: Stub,
    XAxis: Stub,
    YAxis: Stub,
    CartesianGrid: Stub,
    Tooltip: Stub,
    BarChart: Stub,
    Bar: Stub,
    PieChart: Stub,
    Pie: Stub,
    Cell: Stub,
  };
});

jest.mock('./firebase', () => ({
  db: {},
  storage: {},
  auth: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  doc: jest.fn(),
  onSnapshot: jest.fn(),
  updateDoc: jest.fn(),
  writeBatch: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
  getDocs: jest.fn(async () => ({ docs: [] })),
}));

// Mock Notification hook
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
    return <div data-testid="dispatcher-incident-map">Incident Map Component</div>;
  };
});

import { collection, query, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import DispatcherDashboard from './DispatcherDashboard';

describe('DispatcherDashboard - Response Time Trend Integration', () => {
  const mockUser = { uid: 'disp1', email: 'disp@alert24.com' };
  const mockUserData = { name: 'Officer Dan', role: 'dispatcher' };
  let mockOnSnapshotCallbacks = [];

  beforeEach(() => {
    mockOnSnapshotCallbacks = [];
    collection.mockImplementation((db, name) => ({ _colName: name }));
    query.mockImplementation((col) => col);
    doc.mockImplementation((db, col, id) => ({ path: `${col}/${id}` }));
    onSnapshot.mockImplementation((q, callback) => {
      mockOnSnapshotCallbacks.push({ query: q, callback });
      return jest.fn();
    });
    writeBatch.mockReturnValue({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('renders the Response Time Trend card and displays loading state before snapshots arrive', () => {
    render(
      <DispatcherDashboard
        onLogout={jest.fn()}
        user={mockUser}
        userData={mockUserData}
        theme="dark"
        onThemeChange={jest.fn()}
      />
    );

    expect(screen.getByText('Response Time Trend')).toBeInTheDocument();
    expect(screen.getByText('Loading response time data…')).toBeInTheDocument();
  });

  it('displays the professional empty state when there are no incidents or response times recorded', async () => {
    render(
      <DispatcherDashboard
        onLogout={jest.fn()}
        user={mockUser}
        userData={mockUserData}
        theme="dark"
        onThemeChange={jest.fn()}
      />
    );

    // Deliver empty snapshots for incidents, responders, and statusLogs
    await act(async () => {
      mockOnSnapshotCallbacks.forEach(({ callback }) => {
        callback({ docs: [] });
      });
    });

    expect(screen.getByText('No response time data recorded yet')).toBeInTheDocument();
  });

  it('calculates real response time from statusLogs (Reported to On Scene) and renders the trend chart', async () => {
    render(
      <DispatcherDashboard
        onLogout={jest.fn()}
        user={mockUser}
        userData={mockUserData}
        theme="dark"
        onThemeChange={jest.fn()}
      />
    );

    const now = new Date();
    const t0 = new Date(now.getTime() - 25 * 60 * 1000); // Reported 25 min ago
    const tScene = new Date(now.getTime() - 10 * 60 * 1000); // On Scene 10 min ago => Response time = 15 min

    const mockIncidentDoc = {
      id: 'inc-100',
      data: () => ({
        type: 'Fire',
        severity: 'Critical',
        status: 'On Scene',
        createdAt: { toDate: () => t0 },
      }),
    };

    const mockStatusLogDocs = [
      {
        id: 'log-1',
        data: () => ({
          incidentId: 'inc-100',
          status: 'Reported',
          timestamp: { toDate: () => t0 },
        }),
      },
      {
        id: 'log-2',
        data: () => ({
          incidentId: 'inc-100',
          status: 'On Scene',
          timestamp: { toDate: () => tScene }, // 15 mins
        }),
      },
    ];

    await act(async () => {
      mockOnSnapshotCallbacks.forEach(({ query: q, callback }) => {
        if (q && q._colName === 'incidents') {
          callback({ docs: [mockIncidentDoc] });
        } else if (q && q._colName === 'statusLogs') {
          callback({ docs: mockStatusLogDocs });
        } else {
          callback({ docs: [] });
        }
      });
    });

    // Chart should no longer be in empty or loading state
    expect(screen.queryByText('No response time data recorded yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading response time data…')).not.toBeInTheDocument();

    // Card header should display the average
    expect(screen.getByText('Avg 15 mins')).toBeInTheDocument();
  });

  it('excludes incidents without On Scene timestamp and does not plot false zero minutes', async () => {
    render(
      <DispatcherDashboard
        onLogout={jest.fn()}
        user={mockUser}
        userData={mockUserData}
        theme="dark"
        onThemeChange={jest.fn()}
      />
    );

    const now = new Date();
    const t0 = new Date(now.getTime() - 30 * 60 * 1000);

    // Incident is only in 'Assigned' stage; no On Scene log exists
    const mockIncidentDoc = {
      id: 'inc-pending',
      data: () => ({
        type: 'Medical Emergency',
        severity: 'Serious',
        status: 'Assigned',
        createdAt: { toDate: () => t0 },
      }),
    };

    const mockStatusLogDocs = [
      {
        id: 'log-assigned',
        data: () => ({
          incidentId: 'inc-pending',
          status: 'Assigned',
          timestamp: { toDate: () => new Date(now.getTime() - 25 * 60 * 1000) },
        }),
      },
    ];

    await act(async () => {
      mockOnSnapshotCallbacks.forEach(({ query: q, callback }) => {
        if (q && q._colName === 'incidents') {
          callback({ docs: [mockIncidentDoc] });
        } else if (q && q._colName === 'statusLogs') {
          callback({ docs: mockStatusLogDocs });
        } else {
          callback({ docs: [] });
        }
      });
    });

    // Incomplete measurement should not produce 0 mins; should remain empty state
    expect(screen.getByText('No response time data recorded yet')).toBeInTheDocument();
  });
});
