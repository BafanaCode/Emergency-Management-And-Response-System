import React from "react";
import IncidentImage from "../IncidentImage";
import { getIncidentImageUrl } from "../../utils/imageUtils";

const ViewIncidentModal = ({ incident, statusLogs = [], formatDate, onClose }) => {
  if (!incident) return null;

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
        <div className="modal-header">
          <h2 className="modal-title">Incident Details</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close incident details"
          >
            &times;
          </button>
        </div>

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
