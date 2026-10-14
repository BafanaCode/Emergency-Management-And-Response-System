import React from "react";
import { validateImageFile } from "../../utils/imageUtils";
import "./ReportEmergencyTab.css";

const ReportEmergencyTab = ({
  reportFormError,
  reportFormSuccess,
  handleSubmitReport,
  reportType,
  setReportType,
  reportSeverity,
  setReportSeverity,
  reportAddress,
  setReportAddress,
  reportDescription,
  setReportDescription,
  photoInputRef,
  setReportPhoto,
  setReportFormError,
  setReportFormSuccess,
  reportSubmitting,
  reportCoords = null,
  locating = false,
  locationMessage = "",
  onCaptureLocation,
  onClearLocation,
}) => {
  return (
    <div className="form-card full-width">
      {/* Form header */}
      <div className="report-form-header">
        <div className="report-form-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 9V13"
              stroke="#f87171"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M12 17H12.01"
              stroke="#f87171"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M10.29 3.86L1.82 18C1.64 18.3 1.57 18.63 1.61 18.95C1.65 19.27 1.79 19.58 2 19.83C2.21 20.08 2.48 20.27 2.79 20.38C3.09 20.49 3.42 20.51 3.73 20.43L20.27 16.14C20.59 16.06 20.88 15.89 21.1 15.65C21.33 15.41 21.47 15.11 21.51 14.79C21.55 14.47 21.49 14.14 21.33 13.86L14.71 2.86C14.55 2.57 14.31 2.34 14.01 2.19C13.72 2.04 13.39 1.98 13.06 2.02C12.73 2.06 12.42 2.19 12.17 2.41C11.92 2.62 11.74 2.9 11.65 3.22L10.29 3.86Z"
              stroke="#f87171"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <h1 className="report-form-title">Report Emergency</h1>
          <p className="report-form-subtitle">
            Provide accurate details to ensure the fastest possible response.
          </p>
        </div>
      </div>

      {reportFormError && <div className="error-banner">{reportFormError}</div>}
      {reportFormSuccess && (
        <div className="success-banner">{reportFormSuccess}</div>
      )}

      <form className="quick-form" onSubmit={handleSubmitReport} noValidate>
        {/* Row 1: Type + Severity */}
        <div className="form-row">
          <div className="form-field">
            <label className="form-label" htmlFor="report-type">
              Emergency Type <span style={{ color: "#f87171" }}>*</span>
            </label>
            <select
              id="report-type"
              className="form-input"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="">Select type…</option>
              <option value="Road Accident">Road Accident</option>
              <option value="Fire">Fire</option>
              <option value="Medical Emergency">Medical Emergency</option>
              <option value="Flood">Flood</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="report-severity">
              Severity Level <span style={{ color: "#f87171" }}>*</span>
            </label>
            <select
              id="report-severity"
              className="form-input"
              value={reportSeverity}
              onChange={(e) => setReportSeverity(e.target.value)}
            >
              <option value="">Select severity…</option>
              <option value="Minor">Minor</option>
              <option value="Serious">Serious</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </div>

        {/* Address */}
        <div className="form-field">
          <label className="form-label" htmlFor="report-address">
            Incident Address <span style={{ color: "#f87171" }}>*</span>
          </label>
          <input
            id="report-address"
            type="text"
            className="form-input"
            placeholder="Street address or landmark"
            value={reportAddress}
            onChange={(e) => setReportAddress(e.target.value)}
          />
          {onCaptureLocation && (
            <div className="geo-capture">
              <button
                type="button"
                className="geo-btn"
                onClick={onCaptureLocation}
                disabled={locating || reportSubmitting}
                aria-busy={locating}
              >
                {locating
                  ? "Finding your location…"
                  : reportCoords
                  ? "Update my location"
                  : "Use my current location"}
              </button>
              {reportCoords && (
                <>
                  <span className="geo-status ok" role="status">
                    ✓ GPS location attached
                    {Number.isFinite(reportCoords.accuracy)
                      ? ` (accuracy ≈ ${Math.round(reportCoords.accuracy)} m)`
                      : ""}
                  </span>
                  <button type="button" className="geo-btn geo-clear" onClick={onClearLocation}>
                    Remove
                  </button>
                </>
              )}
              {!reportCoords && !locationMessage && (
                <span className="geo-hint">
                  Optional. Shares your coordinates with dispatchers only. You can always type the address.
                </span>
              )}
              {locationMessage && (
                <span className="geo-status warn" role="alert">
                  {locationMessage}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Description */}
        <div className="form-field">
          <label className="form-label" htmlFor="report-description">
            Description <span style={{ color: "#f87171" }}>*</span>
          </label>
          <textarea
            id="report-description"
            className="form-input textarea"
            placeholder="Describe what is happening. Include number of casualties, immediate hazards, and any other critical details…"
            value={reportDescription}
            onChange={(e) => setReportDescription(e.target.value)}
            rows={5}
          />
          <div
            className={`char-count ${
              reportDescription.length >= 20 ? "char-ok" : ""
            }`}
          >
            {reportDescription.length < 20
              ? `${20 - reportDescription.length} more character${
                  20 - reportDescription.length === 1 ? "" : "s"
                } required`
              : `${reportDescription.length} characters (minimum met)`}
          </div>
        </div>

        {/* Photo */}
        <div className="form-field">
          <label className="form-label" htmlFor="report-photo">
            Photo (optional)
          </label>
          <input
            id="report-photo"
            ref={photoInputRef}
            type="file"
            className="form-input file-input"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file =
                e.target.files && e.target.files[0] ? e.target.files[0] : null;
              const check = validateImageFile(file);
              if (!check.ok) {
                setReportPhoto(null);
                e.target.value = "";
                setReportFormSuccess("");
                setReportFormError(check.error);
                return;
              }
              setReportFormError("");
              setReportPhoto(file);
            }}
          />
        </div>

        <button
          type="submit"
          className="submit-btn"
          disabled={reportSubmitting}
          aria-busy={reportSubmitting}
        >
          {reportSubmitting ? "Submitting report…" : "Submit Emergency Report"}
        </button>
      </form>
    </div>
  );
};

export default ReportEmergencyTab;
