import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './IncidentMap.css';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  partitionByCoords,
} from '../../utils/geo';

export const SEVERITY_COLORS = {
  Critical: '#dc2626',
  Serious: '#f97316',
  Minor: '#3b82f6',
};

export const STATUS_COLORS = {
  Reported: '#94a3b8',
  Assigned: '#3b82f6',
  'En Route': '#8b5cf6',
  'On Scene': '#f59e0b',
  Resolved: '#22c55e',
};

// OpenStreetMap's public tile server is subject to its tile usage policy and is not
// intended for high-volume production traffic. Override via REACT_APP_MAP_TILE_URL
// (e.g. a self-hosted or commercial provider) without changing code.
const TILE_URL =
  process.env.REACT_APP_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  process.env.REACT_APP_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const slug = (value = '') => String(value).toLowerCase().replace(/\s+/g, '-');

/** Pin colour = severity; inner dot colour = lifecycle status. */
const buildIcon = (incident) => {
  const sev = SEVERITY_COLORS[incident.severity] || '#64748b';
  const status = STATUS_COLORS[incident.status] || '#94a3b8';
  const resolved = incident.status === 'Resolved' ? ' is-resolved' : '';
  const critical =
    incident.severity === 'Critical' && incident.status !== 'Resolved' ? ' is-critical' : '';
  return L.divIcon({
    className: 'a24-marker-wrap',
    html:
      `<span class="a24-marker${resolved}${critical}" style="--pin:${sev}">` +
      `<span class="a24-marker-dot" style="background:${status}"></span></span>`,
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -32],
  });
};

/** Re-fit the viewport when the set of plotted points changes. */
const FitToMarkers = ({ points }) => {
  const map = useMap();
  const key = points.map((p) => p.incident.incidentId).join('|');
  const lastKey = useRef(null);
  useEffect(() => {
    if (key === lastKey.current) return;
    lastKey.current = key;
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].coords.lat, points[0].coords.lng], 14);
      return;
    }
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.coords.lat, p.coords.lng])),
      { padding: [40, 40], maxZoom: 15 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
};

/** Leaflet measures its container once; tell it when the layout (tab, sidebar) changes. */
const InvalidateOnResize = () => {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const refresh = () => map.invalidateSize();
    const t = setTimeout(refresh, 0);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(refresh);
      ro.observe(el);
    }
    window.addEventListener('orientationchange', refresh);
    return () => {
      clearTimeout(t);
      if (ro) ro.disconnect();
      window.removeEventListener('orientationchange', refresh);
    };
  }, [map]);
  return null;
};

const IncidentMap = ({ incidents = [], formatDate, onViewIncident, onAssignIncident }) => {
  const { plotted, missing } = useMemo(() => partitionByCoords(incidents), [incidents]);
  const icons = useMemo(() => {
    const cache = {};
    plotted.forEach(({ incident }) => {
      cache[incident.incidentId] = buildIcon(incident);
    });
    return cache;
  }, [plotted]);

  const [tileErrors, setTileErrors] = useState(0);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const tilesUnavailable = !online || (tileErrors >= 3 && !tilesLoaded);

  return (
    <section className="a24-map-card" aria-label="Incident map">
      <div className="a24-map-toolbar">
        <div className="a24-map-counts">
          <strong>{plotted.length}</strong> incident{plotted.length === 1 ? '' : 's'} on map
          {missing > 0 && (
            <span className="a24-map-missing">
              {' '}· {missing} without coordinates (address only)
            </span>
          )}
        </div>
        <ul className="a24-map-legend" aria-label="Map legend">
          {Object.entries(SEVERITY_COLORS).map(([label, color]) => (
            <li key={label}>
              <span className="a24-legend-pin" style={{ background: color }} aria-hidden="true" />
              {label}
            </li>
          ))}
          <li className="a24-legend-sep" aria-hidden="true" />
          {Object.entries(STATUS_COLORS).map(([label, color]) => (
            <li key={label}>
              <span className="a24-legend-dot" style={{ background: color }} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {tilesUnavailable && (
        <div className="a24-map-notice" role="alert">
          {!online
            ? 'You appear to be offline. Map tiles cannot load, but incident markers are still listed below.'
            : 'Map tiles could not be loaded from the tile server. Markers are still shown and the list below remains available.'}
        </div>
      )}

      <div className="a24-map-frame">
        <MapContainer
          center={DEFAULT_MAP_CENTER}
          zoom={DEFAULT_MAP_ZOOM}
          scrollWheelZoom={true}
          className="a24-map"
          aria-label="Map of reported incidents"
        >
          <TileLayer
            url={TILE_URL}
            attribution={TILE_ATTRIBUTION}
            maxZoom={19}
            eventHandlers={{
              tileerror: () => setTileErrors((n) => n + 1),
              tileload: () => setTilesLoaded(true),
            }}
          />
          <InvalidateOnResize />
          <FitToMarkers points={plotted} />
          {plotted.map(({ incident, coords }) => (
            <Marker
              key={incident.incidentId}
              position={[coords.lat, coords.lng]}
              icon={icons[incident.incidentId]}
              title={`${incident.type} – ${incident.severity} – ${incident.status}`}
              keyboard={true}
            >
              <Popup minWidth={200} maxWidth={280}>
                <div className="a24-popup">
                  <div className="a24-popup-title">{incident.type}</div>
                  <div className="a24-popup-badges">
                    <span
                      className="a24-popup-badge"
                      style={{ background: SEVERITY_COLORS[incident.severity] || '#64748b' }}
                    >
                      {incident.severity}
                    </span>
                    <span
                      className={`a24-popup-badge status-${slug(incident.status)}`}
                      style={{ background: STATUS_COLORS[incident.status] || '#94a3b8' }}
                    >
                      {incident.status}
                    </span>
                  </div>
                  <div className="a24-popup-address">{incident.address}</div>
                  {incident.createdAt && formatDate && (
                    <div className="a24-popup-time">Reported {formatDate(incident.createdAt)}</div>
                  )}
                  {incident.responderName && (
                    <div className="a24-popup-time">Responder: {incident.responderName}</div>
                  )}
                  <div className="a24-popup-actions">
                    <button
                      type="button"
                      className="a24-popup-btn"
                      onClick={() => onViewIncident && onViewIncident(incident)}
                    >
                      View details
                    </button>
                    {incident.status === 'Reported' && onAssignIncident && (
                      <button
                        type="button"
                        className="a24-popup-btn primary"
                        onClick={() => onAssignIncident(incident)}
                      >
                        Assign
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        {plotted.length === 0 && (
          <div className="a24-map-empty" role="status">
            <strong>No incidents with coordinates yet</strong>
            <span>
              Markers appear when a reporter shares their location. Incidents with only an address
              are not plotted — addresses are never guessed.
            </span>
          </div>
        )}
      </div>
    </section>
  );
};

export default IncidentMap;
