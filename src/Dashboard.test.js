import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Firebase mocks ──────────────────────────────────────────────────────────
const mockBatch = { set: jest.fn(), update: jest.fn(), commit: jest.fn() };

jest.mock('./firebase', () => ({ db: {}, storage: {}, auth: {} }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn(),
  writeBatch: jest.fn(),
  serverTimestamp: jest.fn(),
  updateDoc: jest.fn(),
}));

jest.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return { PieChart: Stub, Pie: Stub, Cell: Stub, ResponsiveContainer: Stub, Tooltip: Stub };
});

// Keep the real validation + error class, replace only the network-touching upload
jest.mock('./utils/imageUtils', () => ({
  ...jest.requireActual('./utils/imageUtils'),
  uploadIncidentImage: jest.fn(),
}));

import Dashboard from './Dashboard';
import { uploadIncidentImage, ImageProcessingError } from './utils/imageUtils';
import { updateDoc, collection, doc, query, onSnapshot, writeBatch, serverTimestamp } from 'firebase/firestore';

const FILLED_DESCRIPTION = 'A large fire is spreading through the warehouse';

function renderAndOpenReportForm() {
  render(
    <Dashboard
      onLogout={jest.fn()}
      user={{ uid: 'rep1' }}
      userData={{ name: 'Reporter One', role: 'reporter' }}
      theme="dark"
      onThemeChange={jest.fn()}
    />
  );
  fireEvent.click(screen.getByTitle('Report Emergency'));
}

function fillForm() {
  fireEvent.change(screen.getByLabelText(/Emergency Type/), { target: { value: 'Fire' } });
  fireEvent.change(screen.getByLabelText(/Severity Level/), { target: { value: 'Critical' } });
  fireEvent.change(screen.getByPlaceholderText('Street address or landmark'), { target: { value: '1 Main Street' } });
  fireEvent.change(screen.getByPlaceholderText(/Describe what is happening/), { target: { value: FILLED_DESCRIPTION } });
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /Submit Emergency Report/ }));

describe('Reporter incident submission', () => {
  beforeEach(() => {
    // CRA's jest config sets resetMocks:true, so implementations are installed per test
    collection.mockImplementation((db, name) => ({ __col: name }));
    doc.mockImplementation((base, ...segs) =>
      base && base.__col
        ? { id: 'new123', path: `${base.__col}/new123` }
        : { id: segs[segs.length - 1], path: segs.join('/') }
    );
    query.mockImplementation((...args) => args);
    onSnapshot.mockImplementation(() => jest.fn());
    writeBatch.mockImplementation(() => mockBatch);
    serverTimestamp.mockImplementation(() => 'SERVER_TS');
    mockBatch.set = jest.fn();
    mockBatch.update = jest.fn();
    mockBatch.commit = jest.fn().mockResolvedValue(undefined);
    uploadIncidentImage.mockResolvedValue('');
  });

  test('persists the incident and its initial Reported history entry in ONE atomic batch', async () => {
    renderAndOpenReportForm();
    fillForm();
    submit();

    expect(await screen.findByText(/Emergency reported successfully/)).toBeInTheDocument();
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);

    const setCalls = mockBatch.set.mock.calls;
    expect(setCalls).toHaveLength(3);
    const [incidentRef, incidentData] = setCalls[0];
    const [logRef, logData] = setCalls[1];
    const [notifRef, notifData] = setCalls[2];
    expect(incidentRef.path).toBe('incidents/new123');
    expect(incidentData).toMatchObject({ reporterId: 'rep1', status: 'Reported', type: 'Fire', severity: 'Critical' });
    expect(logRef.path).toBe('statusLogs/new123_reported');
    expect(logData).toMatchObject({ incidentId: 'new123', status: 'Reported', updatedBy: 'rep1' });
    expect(notifRef.path).toBe('notifications/new123_reported_dispatchers');
    expect(notifData).toMatchObject({
      userId: 'dispatchers',
      incidentId: 'new123',
      type: 'incident_reported',
      isRead: false
    });
    // The forbidden follow-up write (reporters may not update incidents) is gone
    expect(updateDoc).not.toHaveBeenCalled();
  });

  test('does NOT claim success when the write is rejected', async () => {
    mockBatch.commit.mockRejectedValue({ code: 'permission-denied', message: 'Missing or insufficient permissions' });
    renderAndOpenReportForm();
    fillForm();
    submit();

    expect(await screen.findByText(/Your report was NOT submitted/)).toBeInTheDocument();
    expect(screen.queryByText(/Emergency reported successfully/)).not.toBeInTheDocument();
    // raw Firebase error text is not leaked to the user
    expect(screen.queryByText(/Missing or insufficient permissions/)).not.toBeInTheDocument();
  });

  test('a photo that cannot be saved stops the submission with an accurate message', async () => {
    uploadIncidentImage.mockRejectedValue(new ImageProcessingError('The photo could not be processed or uploaded.'));
    renderAndOpenReportForm();
    fillForm();
    fireEvent.change(screen.getByLabelText(/Photo/), {
      target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] },
    });
    submit();

    expect(await screen.findByText(/photo could not be processed or uploaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/Emergency reported successfully/)).not.toBeInTheDocument();
    expect(mockBatch.commit).not.toHaveBeenCalled(); // no incident created without the photo
  });

  test('an invalid file type is rejected on selection and never submitted', async () => {
    renderAndOpenReportForm();
    fillForm();
    fireEvent.change(screen.getByLabelText(/Photo/), {
      target: { files: [new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText(/Unsupported photo type/)).toBeInTheDocument();
    submit();
    await waitFor(() => expect(mockBatch.commit).toHaveBeenCalledTimes(1)); // submits WITHOUT the rejected file
    expect(uploadIncidentImage).not.toHaveBeenCalled();
  });

  test('an oversized file is rejected on selection', async () => {
    renderAndOpenReportForm();
    fillForm();
    const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText(/Photo/), { target: { files: [big] } });

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
  });
});
