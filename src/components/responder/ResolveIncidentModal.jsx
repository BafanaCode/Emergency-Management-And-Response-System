import React from "react";

const ResolveIncidentModal = ({
  isOpen,
  activeIncident,
  resolveNotes,
  setResolveNotes,
  onClose,
  onConfirm,
  updatingStatus,
}) => {
  if (!isOpen || !activeIncident) return null;

  return (
    <div className="rd-modal-overlay" onClick={onClose}>
      <div
        className="rd-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rd-resolve-modal-title"
      >
        <div className="rd-modal-header">
          <h2 id="rd-resolve-modal-title" className="rd-modal-title">
            Confirm Resolution
          </h2>
          <button
            className="rd-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div className="rd-modal-body">
          <p className="rd-modal-desc">
            Are you sure you want to mark this incident as resolved? This will
            notify dispatch and the reporter, and return your unit to available
            status.
          </p>
          <div className="rd-modal-incident-summary">
            <div className="rd-summary-row">
              <span className="rd-summary-label">Incident:</span>
              <span className="rd-summary-val">{activeIncident.type}</span>
            </div>
            <div className="rd-summary-row">
              <span className="rd-summary-label">Location:</span>
              <span className="rd-summary-val">{activeIncident.address}</span>
            </div>
          </div>
          <div className="rd-form-field" style={{ marginTop: 14 }}>
            <label className="rd-form-label" htmlFor="rd-resolve-notes">
              Resolution Notes (Optional)
            </label>
            <textarea
              id="rd-resolve-notes"
              className="rd-textarea"
              placeholder="Summarize actions taken or closing notes…"
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <div className="rd-modal-footer">
          <button
            type="button"
            className="rd-btn rd-btn-secondary"
            onClick={onClose}
            disabled={updatingStatus}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rd-btn rd-btn-action"
            onClick={() => onConfirm(resolveNotes)}
            disabled={updatingStatus}
          >
            {updatingStatus ? "Resolving…" : "Confirm & Resolve"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResolveIncidentModal;
