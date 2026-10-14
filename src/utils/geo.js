/**
 * Geolocation helpers for incident mapping.
 *
 * Incident documents store OPTIONAL `latitude` / `longitude` numbers, written only
 * when a reporter explicitly shares their browser location. Alert24 never geocodes
 * free-text addresses, so incidents without those fields simply have no map marker.
 */

// Rough centre of South Africa, used only when there is nothing to plot.
export const DEFAULT_MAP_CENTER = [-28.5, 24.7];
export const DEFAULT_MAP_ZOOM = 5;

export const isValidCoordinate = (lat, lng) =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;

/** Returns `{ lat, lng }` for an incident with valid stored coordinates, otherwise null. */
export const getIncidentCoords = (incident) => {
  if (!incident) return null;
  const { latitude, longitude } = incident;
  return isValidCoordinate(latitude, longitude) ? { lat: latitude, lng: longitude } : null;
};

/** Splits incidents into those that can be plotted and a count of those that cannot. */
export const partitionByCoords = (incidents = []) => {
  const plotted = [];
  let missing = 0;
  incidents.forEach((incident) => {
    const coords = getIncidentCoords(incident);
    if (coords) plotted.push({ incident, coords });
    else missing += 1;
  });
  return { plotted, missing };
};

export const geolocationErrorMessage = (err) => {
  switch (err && err.code) {
    case 1:
      return 'Location permission was denied. You can still type the address manually.';
    case 2:
      return 'Your location could not be determined. Please type the address manually.';
    case 3:
      return 'Finding your location timed out. Please try again or type the address manually.';
    case 'unsupported':
      return 'Location is not available in this browser. Please type the address manually.';
    case 'insecure':
      return 'Location sharing requires a secure (HTTPS) connection. Please type the address manually.';
    default:
      return 'Could not get your location. Please type the address manually.';
  }
};

/**
 * Promise wrapper around navigator.geolocation. Must be called from a user action so
 * the browser shows its explicit permission prompt. Resolves with
 * `{ latitude, longitude, accuracy }`; rejects with `{ code, message }`.
 */
export const requestCurrentPosition = (options = {}) =>
  new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject({ code: 'unsupported', message: geolocationErrorMessage({ code: 'unsupported' }) });
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      reject({ code: 'insecure', message: geolocationErrorMessage({ code: 'insecure' }) });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = Number(pos.coords.latitude.toFixed(6));
        const longitude = Number(pos.coords.longitude.toFixed(6));
        if (!isValidCoordinate(latitude, longitude)) {
          reject({ code: 2, message: geolocationErrorMessage({ code: 2 }) });
          return;
        }
        resolve({ latitude, longitude, accuracy: pos.coords.accuracy });
      },
      (err) => reject({ code: err.code, message: geolocationErrorMessage(err) }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000, ...options }
    );
  });
