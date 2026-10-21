import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ViewIncidentModal as DispatcherViewIncidentModal } from '../dispatcher/ViewIncidentModal';
import ReporterViewIncidentModal from '../reporter/ViewIncidentModal';
import ReportsTab from '../dispatcher/ReportsTab';
import * as pdfExportModule from '../../utils/pdfExport';

// Mock pdfExport functions
jest.mock('../../utils/pdfExport', () => {
  const actual = jest.requireActual('../../utils/pdfExport');
  return {
    ...actual,
    generateIncidentReportPDF: jest.fn(() => ({ save: jest.fn() })),
  };
});

describe('Incident Report PDF Export UI Integration', () => {
  const mockIncident = {
    incidentId: 'INC-701',
    type: 'Medical Emergency',
    severity: 'Critical',
    status: 'Resolved',
    createdAt: new Date('2026-10-15T08:00:00Z'),
    updatedAt: new Date('2026-10-15T09:30:00Z'),
    address: '45 Bree St, Cape Town',
    description: 'Patient unresponsive following acute respiratory distress.',
    reporterName: 'Alice Green',
    responderName: 'Paramedic Team 1',
  };

  const mockStatusLogs = [
    { logId: 'log-1', status: 'Reported', timestamp: new Date('2026-10-15T08:00:00Z'), notes: 'Emergency logged' },
    { logId: 'log-2', status: 'Assigned', timestamp: new Date('2026-10-15T08:05:00Z'), notes: 'Assigned to Paramedic Team 1' },
    { logId: 'log-3', status: 'Resolved', timestamp: new Date('2026-10-15T09:30:00Z'), notes: 'Patient stabilized and transferred' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Dispatcher ViewIncidentModal PDF Export', () => {
    it('renders the Export PDF Report button and triggers export with userRole: "dispatcher"', async () => {
      render(
        <DispatcherViewIncidentModal
          viewIncident={mockIncident}
          onClose={jest.fn()}
          statusLogs={mockStatusLogs}
          formatDate={(d) => String(d)}
          SeverityBadge={({ severity }) => <span>{severity}</span>}
          StatusBadge={({ status }) => <span>{status}</span>}
        />
      );

      const exportBtn = screen.getByRole('button', { name: /Export PDF Report/i });
      expect(exportBtn).toBeInTheDocument();

      fireEvent.click(exportBtn);

      expect(pdfExportModule.generateIncidentReportPDF).toHaveBeenCalledWith({
        incident: mockIncident,
        statusLogs: mockStatusLogs,
        userRole: 'dispatcher',
        download: true,
      });
    });

    it('shows error message if PDF generation throws an exception', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      pdfExportModule.generateIncidentReportPDF.mockImplementationOnce(() => {
        throw new Error('PDF render fault');
      });

      render(
        <DispatcherViewIncidentModal
          viewIncident={mockIncident}
          onClose={jest.fn()}
          statusLogs={mockStatusLogs}
          formatDate={(d) => String(d)}
          SeverityBadge={({ severity }) => <span>{severity}</span>}
          StatusBadge={({ status }) => <span>{status}</span>}
        />
      );

      const exportBtn = screen.getByRole('button', { name: /Export PDF Report/i });
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(screen.getByText(/Failed to generate PDF report/i)).toBeInTheDocument();
      });
      spy.mockRestore();
    });
  });

  describe('Reporter ViewIncidentModal PDF Export', () => {
    it('renders the Export PDF Report button and triggers export with userRole: "reporter"', async () => {
      render(
        <ReporterViewIncidentModal
          incident={mockIncident}
          statusLogs={mockStatusLogs}
          formatDate={(d) => String(d)}
          onClose={jest.fn()}
        />
      );

      const exportBtn = screen.getByRole('button', { name: /Export PDF Report/i });
      expect(exportBtn).toBeInTheDocument();

      fireEvent.click(exportBtn);

      expect(pdfExportModule.generateIncidentReportPDF).toHaveBeenCalledWith({
        incident: mockIncident,
        statusLogs: mockStatusLogs,
        userRole: 'reporter',
        download: true,
      });
    });
  });

  describe('Dispatcher ReportsTab Individual Incident PDF Export', () => {
    it('renders individual PDF Report export button for each table row and invokes onExportIncidentPDF', async () => {
      const mockExportHandler = jest.fn().mockResolvedValue();

      render(
        <ReportsTab
          reportsSearchQuery=""
          setReportsSearchQuery={jest.fn()}
          statusFilter="All"
          setStatusFilter={jest.fn()}
          severityFilter="All"
          setSeverityFilter={jest.fn()}
          dateFrom=""
          setDateFrom={jest.fn()}
          dateTo=""
          setDateTo={jest.fn()}
          filteredIncidents={[mockIncident]}
          downloadPDF={jest.fn()}
          downloadCSV={jest.fn()}
          formatDate={(d) => String(d)}
          onExportIncidentPDF={mockExportHandler}
        />
      );

      // Check table header has "Report"
      expect(screen.getByText('Report')).toBeInTheDocument();

      // Check row export button exists
      const rowExportBtn = screen.getByRole('button', { name: /PDF Report/i });
      expect(rowExportBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(rowExportBtn);
      });

      expect(mockExportHandler).toHaveBeenCalledWith(mockIncident);
    });

    it('displays error notice in ReportsTab if row export fails', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const mockExportHandler = jest.fn().mockRejectedValue(new Error('Network error'));

      render(
        <ReportsTab
          reportsSearchQuery=""
          setReportsSearchQuery={jest.fn()}
          statusFilter="All"
          setStatusFilter={jest.fn()}
          severityFilter="All"
          setSeverityFilter={jest.fn()}
          dateFrom=""
          setDateFrom={jest.fn()}
          dateTo=""
          setDateTo={jest.fn()}
          filteredIncidents={[mockIncident]}
          downloadPDF={jest.fn()}
          downloadCSV={jest.fn()}
          formatDate={(d) => String(d)}
          onExportIncidentPDF={mockExportHandler}
        />
      );

      const rowExportBtn = screen.getByRole('button', { name: /PDF Report/i });
      await act(async () => {
        fireEvent.click(rowExportBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Failed to export report for INC-701/i)).toBeInTheDocument();
      });
      spy.mockRestore();
    });
  });
});
