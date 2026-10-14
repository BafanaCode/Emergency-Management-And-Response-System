import React from 'react';

export const AssignIncidentModal = ({
  assignIncident,
  onClose,
  responders,
  selectedResponder,
  onSelectResponder,
  onAssign,
  assigning = false,
  SeverityBadge,
  IconCheck,
}) => {
  if (!assignIncident) return null;

  return (
    <div className="dd-overlay" onClick={onClose}>
      <div className="dd-modal" onClick={(e) => e.stopPropagation()}>
        <button className="dd-modal-close" onClick={onClose}>×</button>
        <h2 className="dd-modal-title">Assign Responder</h2>

        {/* Incident summary strip */}
        <div className="dd-incident-summary">
          <div className="dd-incident-summary-field">
            <span className="dd-incident-summary-label">Type</span>
            <span className="dd-incident-summary-value">{assignIncident.type}</span>
          </div>
          <div className="dd-incident-summary-field">
            <span className="dd-incident-summary-label">Severity</span>
            <SeverityBadge severity={assignIncident.severity} />
          </div>
          <div className="dd-incident-summary-field">
            <span className="dd-incident-summary-label">Location</span>
            <span className="dd-incident-summary-value">{assignIncident.address}</span>
          </div>
        </div>

        <div className="dd-modal-subtitle">Select Responder</div>

        <div className="dd-responder-list">
          {responders.length === 0 ? (
            <div className="dd-notif-empty">No responders registered</div>
          ) : (
            responders.map((responder) => (
              <div
                key={responder.uid}
                className={`dd-responder-row ${
                  !responder.isAvailable
                    ? "unavailable"
                    : selectedResponder?.uid === responder.uid
                    ? "selected"
                    : "selectable"
                }`}
                onClick={() => {
                  if (responder.isAvailable) {
                    onSelectResponder(
                      selectedResponder?.uid === responder.uid ? null : responder
                    );
                  }
                }}
              >
                <div>
                  <div className="dd-responder-name">{responder.name}</div>
                  <div className="dd-responder-meta">
                    <span>{responder.speciality || "General"}</span>
                    <span>·</span>
                    <span className={`dd-badge ${responder.isAvailable ? "dd-badge-available" : "dd-badge-unavailable"}`}>
                      {responder.isAvailable ? "Available" : "Unavailable"}
                    </span>
                  </div>
                </div>
                <div className="dd-responder-check">
                  {selectedResponder?.uid === responder.uid && (
                    <span className="dd-responder-check-icon"><IconCheck /></span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="dd-modal-actions">
          <button
            className="dd-btn dd-btn-primary"
            onClick={onAssign}
            disabled={!selectedResponder || assigning}
            aria-busy={assigning}
          >
            {assigning ? "Assigning…" : "Assign Responder"}
          </button>
          <button
            className="dd-btn dd-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignIncidentModal;
