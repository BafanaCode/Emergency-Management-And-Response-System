import React from 'react';
import './ActiveIncidentBanner.css';

const IconLocationPin = () => (
  <svg
    className="a24-incident-banner__loc-icon"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconArrowRight = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

/**
 * Shared Active Incident Summary Bar used by both Reporter and Responder dashboards.
 * Ensures identical visual hierarchy, typography, status separation, and light/dark theme fidelity.
 */
const ActiveIncidentBanner = ({
  incident,
  eyebrowLabel = 'Active Incident',
  actionLabel = 'View Incident',
  onAction,
  idleTitle = 'All Systems Normal',
  idleDescription = 'No active emergency incidents currently open.',
  idleActionLabel = '',
  onIdleAction,
}) => {
  if (!incident) {
    return (
      <section
        className="a24-incident-banner a24-incident-banner--idle status-banner status-idle"
        aria-label="Incident status summary"
      >
        <div className="a24-incident-banner__main">
          <span className="a24-incident-banner__dot a24-incident-banner__dot--idle" aria-hidden="true" />
          <div className="a24-incident-banner__content">
            <div className="a24-incident-banner__idle-row">
              <span className="a24-incident-banner__idle-title">{idleTitle}</span>
              {idleDescription && (
                <span className="a24-incident-banner__idle-desc">{idleDescription}</span>
              )}
            </div>
          </div>
        </div>
        {idleActionLabel && typeof onIdleAction === 'function' && (
          <div className="a24-incident-banner__actions">
            <button
              type="button"
              className="a24-incident-banner__btn a24-incident-banner__btn--primary banner-btn"
              onClick={onIdleAction}
            >
              {idleActionLabel}
            </button>
          </div>
        )}
      </section>
    );
  }

  const statusKey = (incident.status || 'Reported').toLowerCase().replace(/\s+/g, '-');
  const severityKey = (incident.severity || '').toLowerCase();

  return (
    <section
      className="a24-incident-banner a24-incident-banner--active status-banner status-active"
      aria-label="Active incident summary"
    >
      <div className="a24-incident-banner__main">
        <div className="a24-incident-banner__indicator-wrap" aria-hidden="true">
          <span className="a24-incident-banner__dot a24-incident-banner__dot--active" />
        </div>

        <div className="a24-incident-banner__content">
          {/* Row 1: Eyebrow label + separated status & severity */}
          <div className="a24-incident-banner__meta-row">
            <span className="a24-incident-banner__eyebrow">{eyebrowLabel}</span>
            <span className="a24-incident-banner__meta-sep" aria-hidden="true" />
            <div className="a24-incident-banner__status-group">
              <span className="a24-incident-banner__status-label">Status</span>
              <span className={`a24-incident-banner__status-pill a24-status-${statusKey}`}>
                <span className="a24-incident-banner__status-dot" aria-hidden="true" />
                {incident.status || 'Reported'}
              </span>
            </div>
            {incident.severity && (
              <>
                <span className="a24-incident-banner__meta-sep" aria-hidden="true" />
                <div className="a24-incident-banner__status-group">
                  <span className="a24-incident-banner__status-label">Severity</span>
                  <span className={`a24-incident-banner__severity-pill a24-severity-${severityKey}`}>
                    {incident.severity}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Row 2: Prominent incident type */}
          <div className="a24-incident-banner__type">{incident.type || 'Emergency Incident'}</div>

          {/* Row 3: Location with pin icon */}
          {incident.address && (
            <div className="a24-incident-banner__location" title={incident.address}>
              <IconLocationPin />
              <span className="a24-incident-banner__address">{incident.address}</span>
            </div>
          )}
        </div>
      </div>

      {typeof onAction === 'function' && (
        <div className="a24-incident-banner__actions">
          <button
            type="button"
            className="a24-incident-banner__btn a24-incident-banner__btn--action banner-btn"
            onClick={onAction}
          >
            <span>{actionLabel}</span>
            <IconArrowRight />
          </button>
        </div>
      )}
    </section>
  );
};

export default ActiveIncidentBanner;

