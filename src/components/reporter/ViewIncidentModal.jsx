import React, { useState } from "react";
import IncidentImage from "../IncidentImage";
import { getIncidentImageUrl } from "../../utils/imageUtils";
import { generateIncidentReportPDF } from "../../utils/pdfExport";

const ViewIncidentModal = ({ incident, statusLogs = [], formatDate, onClose }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  if (!incident) return null;

  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError("");
    try {
      generateIncidentReportPDF({
        incident,
        statusLogs,
        userRole: "reporter",
        download: true,
      });
    } catch (err) {
      console.error("Failed to export incident PDF:", err);
      setExportError("Failed to generate PDF report. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Incident Details"
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal header — matches dd-modal structure */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>Incident Details</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportPDF}
              disabled={isExporting}
              aria-busy={isExporting}
              style={{ fontSize: '13px', padding: '6px 12px' }}
              title="Download official PDF report for this incident"
            >
              {isExporting ? 'Generating PDF…' : '📄 Export PDF Report'}
            </button>
            <button
              className="modal-close"
              onClick={onClose}
              aria-label="Close incident details"
            >
              &times;
            </button>
          </div>
        </div>

        {exportError && (
          <div className="alert alert-error" style={{ margin: '12px 16px 0 16px' }}>
            {exportError}
          </div>
        )}

        {/* Modal body */}
        <div className="modal-body">
          {/* Detail grid — matches dd-detail-grid */}
          <div className="incident-details">
            <div className="detail-row">
              <span className="detail-label">Type</span>
              <span className="detail-value">{incident.type}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Severity</span>
              <span
                className={`badge badge-${incident.severity ? incident.severity.toLowerCase() : "default"}`}
              >
                {incident.severity}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span
                className={`status-badge status-${incident.status ? incident.status.toLowerCase().replace(" ", "-") : "default"}`}
              >
                {incident.status}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Reported</span>
              <span className="detail-value">{formatDate(incident.createdAt)}</span>
            </div>
            <div className="detail-row full-width">
              <span className="detail-label">Address</span>
              <span className="detail-value">{incident.address}</span>
            </div>
            <div className="detail-row full-width">
              <span className="detail-label">Description</span>
              <span className="detail-value detail-description">
                {incident.description}
              </span>
            </div>
            {getIncidentImageUrl(incident) && (
              <div className="detail-row full-width">
                <span className="detail-label">Photo</span>
                <IncidentImage
                  incident={incident}
                  className="incident-photo"
                  alt="Incident photo"
                />
              </div>
            )}
          </div>

          <div className="modal-divider"></div>

          {/* Status History — matches dd-timeline style */}
          <div className="status-logs-title">Status History</div>
          <div className="status-logs">
            {statusLogs && statusLogs.length > 0 ? (
              statusLogs.map((log) => (
                <div key={log.logId} className="status-log-item">
                  <span
                    className={`status-badge status-${log.status ? log.status.toLowerCase().replace(" ", "-") : "default"}`}
                  >
                    {log.status}
                  </span>
                  <span className="log-notes">{log.notes}</span>
                  <span className="log-time">{formatDate(log.timestamp)}</span>
                </div>
              ))
            ) : (
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "13px",
                  padding: "8px 0",
                }}
              >
                No status updates yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewIncidentModal;
