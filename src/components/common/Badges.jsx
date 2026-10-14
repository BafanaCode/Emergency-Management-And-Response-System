import React from "react";

export const SeverityBadge = ({ severity }) => {
  const cls =
    {
      Critical: "dd-badge dd-badge-critical",
      Serious: "dd-badge dd-badge-serious",
      Minor: "dd-badge dd-badge-minor",
    }[severity] || "dd-badge dd-badge-minor";
  return <span className={cls}>{severity}</span>;
};

export const StatusBadge = ({ status }) => {
  const key = (status || "").toLowerCase().replace(/\s+/g, "-");
  return <span className={`dd-badge dd-badge-${key}`}>{status}</span>;
};
