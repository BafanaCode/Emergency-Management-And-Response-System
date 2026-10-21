import React, { useState } from "react";
import { SeverityBadge, StatusBadge } from "../common/Badges";
import { generateIncidentReportPDF } from "../../utils/pdfExport";

const ReportsTab = ({
  reportsSearchQuery,
  setReportsSearchQuery,
  statusFilter,
  setStatusFilter,
  severityFilter,
  setSeverityFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  filteredIncidents = [],
  downloadPDF,
  downloadCSV,
  formatDate,
  onExportIncidentPDF,
}) => {
  const [exportingId, setExportingId] = useState(null);
  const [exportError, setExportError] = useState("");
  const hasActiveFilters =
    reportsSearchQuery ||
    statusFilter !== "All" ||
    severityFilter !== "All" ||
    dateFrom ||
    dateTo;

  const handleReset = () => {
    setReportsSearchQuery("");
    setStatusFilter("All");
    setSeverityFilter("All");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <>
      <div className="dd-page-header">
        <h1 className="dd-page-title">Incident Reports</h1>
        <p className="dd-page-subtitle">Filter, review and export incident data</p>
      </div>
      <div className="dd-card">
        <div className="dd-filter-bar">
          <div className="dd-search-wrap">
            <svg
              className="dd-search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21L16.65 16.65" />
            </svg>
            <input
              type="text"
              className="dd-input dd-search-input"
              placeholder="Search report records…"
              value={reportsSearchQuery}
              onChange={(e) => setReportsSearchQuery(e.target.value)}
              aria-label="Search reports"
            />
            {reportsSearchQuery && (
              <button
                type="button"
                className="dd-search-clear"
                onClick={() => setReportsSearchQuery("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <select
            className="dd-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Reported">Reported</option>
            <option value="Assigned">Assigned</option>
            <option value="En Route">En Route</option>
            <option value="On Scene">On Scene</option>
            <option value="Resolved">Resolved</option>
          </select>
          <select
            className="dd-select"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option value="All">All Severities</option>
            <option value="Minor">Minor</option>
            <option value="Serious">Serious</option>
            <option value="Critical">Critical</option>
          </select>
          <input
            type="date"
            className="dd-input"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From Date"
            title="From date"
          />
          <input
            type="date"
            className="dd-input"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To Date"
            title="To date"
          />
          {hasActiveFilters && (
            <button
              type="button"
              className="dd-btn dd-btn-secondary dd-btn-sm"
              onClick={handleReset}
            >
              Reset
            </button>
          )}
        </div>

        {exportError && (
          <div className="dd-alert dd-alert-error" style={{ marginBottom: 12 }}>
            {exportError}
          </div>
        )}

        <div className="dd-table-wrap">
          <table className="dd-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Severity</th>
                <th>Reporter</th>
                <th>Address</th>
                <th>Status</th>
                <th>Date</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {filteredIncidents.length === 0 ? (
                <tr className="dd-empty-row">
                  <td colSpan="7">No incidents match the selected filters</td>
                </tr>
              ) : (
                filteredIncidents.map((incident) => (
                  <tr key={incident.incidentId}>
                    <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                      {incident.type}
                    </td>
                    <td>
                      <SeverityBadge severity={incident.severity} />
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {incident.reporterName || "Anonymous"}
                    </td>
                    <td
                      title={incident.address}
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {incident.address}
                    </td>
                    <td>
                      <StatusBadge status={incident.status} />
                    </td>
                    <td
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDate(incident.createdAt)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="dd-btn dd-btn-outline dd-btn-xs"
                        onClick={async () => {
                          if (exportingId) return;
                          setExportError("");
                          setExportingId(incident.incidentId);
                          try {
                            if (typeof onExportIncidentPDF === "function") {
                              await onExportIncidentPDF(incident);
                            } else {
                              generateIncidentReportPDF({
                                incident,
                                statusLogs: [],
                                userRole: "dispatcher",
                                download: true,
                              });
                            }
                          } catch (err) {
                            console.error("Failed to export incident PDF:", err);
                            setExportError(`Failed to export report for ${incident.incidentId || incident.type}.`);
                          } finally {
                            setExportingId(null);
                          }
                        }}
                        disabled={exportingId === incident.incidentId}
                        aria-busy={exportingId === incident.incidentId}
                        style={{ fontSize: 11, padding: "3px 8px", whiteSpace: "nowrap" }}
                        title={`Export official PDF report for ${incident.incidentId || incident.type}`}
                      >
                        {exportingId === incident.incidentId ? "Exporting…" : "📄 PDF Report"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="dd-download-row">
          <button className="dd-btn dd-btn-download" onClick={downloadPDF}>
            ↓ Download PDF
          </button>
          <button className="dd-btn dd-btn-download" onClick={downloadCSV}>
            ↓ Download CSV
          </button>
        </div>
      </div>
    </>
  );
};

export default ReportsTab;
