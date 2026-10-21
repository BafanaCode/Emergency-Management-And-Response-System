import React, { useState } from 'react';
import IncidentImage from '../IncidentImage';
import { getIncidentImageUrl } from '../../utils/imageUtils';
import { generateIncidentReportPDF } from '../../utils/pdfExport';

export const ViewIncidentModal = ({
  viewIncident,
  onClose,
  statusLogs,
  formatDate,
  SeverityBadge,
  StatusBadge,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  if (!viewIncident) return null;

  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError('');
    try {
      generateIncidentReportPDF({
        incident: viewIncident,
        statusLogs,
        userRole: 'dispatcher',
        download: true,
      });
    } catch (err) {
      console.error('Failed to export incident PDF:', err);
      setExportError('Failed to generate PDF report. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="dd-overlay" onClick={onClose}>
      <div className="dd-modal" onClick={(e) => e.stopPropagation()}>
        <button className="dd-modal-close" onClick={onClose}>×</button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 32, marginBottom: 12 }}>
          <h2 className="dd-modal-title" style={{ margin: 0 }}>Incident Details</h2>
          <button
            type="button"
            className="dd-btn dd-btn-outline dd-btn-sm"
            onClick={handleExportPDF}
            disabled={isExporting}
            aria-busy={isExporting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Download complete official PDF report"
          >
            {isExporting ? 'Generating PDF…' : '📄 Export PDF Report'}
          </button>
        </div>

        {exportError && (
          <div className="dd-alert dd-alert-error" style={{ marginBottom: 14 }}>
            {exportError}
          </div>
        )}

        <div className="dd-detail-grid">
          <div className="dd-detail-item">
            <span className="dd-detail-label">Type</span>
            <span className="dd-detail-value" style={{ fontWeight: 600 }}>{viewIncident.type}</span>
          </div>
          <div className="dd-detail-item">
            <span className="dd-detail-label">Severity</span>
            <div style={{ marginTop: 3 }}><SeverityBadge severity={viewIncident.severity} /></div>
          </div>
          <div className="dd-detail-item">
            <span className="dd-detail-label">Current Status</span>
            <div style={{ marginTop: 3 }}><StatusBadge status={viewIncident.status} /></div>
          </div>
          <div className="dd-detail-item">
            <span className="dd-detail-label">Reported</span>
            <span className="dd-detail-value">{formatDate(viewIncident.createdAt)}</span>
          </div>
          <div className="dd-detail-item full-width">
            <span className="dd-detail-label">Location</span>
            <span className="dd-detail-value">{viewIncident.address}</span>
          </div>
          <div className="dd-detail-item full-width">
            <span className="dd-detail-label">Description</span>
            <span className="dd-detail-value" style={{ lineHeight: 1.6 }}>{viewIncident.description}</span>
          </div>
          {getIncidentImageUrl(viewIncident) && (
            <div className="dd-detail-item full-width">
              <span className="dd-detail-label">Photo</span>
              <IncidentImage
                incident={viewIncident}
                className="dd-incident-photo"
                alt="Incident photo"
              />
            </div>
          )}
        </div>

        <div className="dd-modal-divider"></div>

        <div className="dd-modal-subtitle">Status History</div>
        <div className="dd-timeline">
          {statusLogs.length === 0 ? (
            <div className="dd-timeline-empty">No status updates recorded yet</div>
          ) : (
            statusLogs.map((log) => (
              <div key={log.logId} className="dd-timeline-item">
                <div className="dd-timeline-line-wrap">
                  <div className="dd-timeline-dot"></div>
                  <div className="dd-timeline-connector"></div>
                </div>
                <div className="dd-timeline-body">
                  <div className="dd-timeline-status">
                    <StatusBadge status={log.status} />
                  </div>
                  <div className="dd-timeline-notes">{log.notes}</div>
                  <div className="dd-timeline-time">{formatDate(log.timestamp)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewIncidentModal;
