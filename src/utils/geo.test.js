import {
  isValidCoordinate,
  getIncidentCoords,
  partitionByCoords,
  requestCurrentPosition,
  geolocationErrorMessage,
} from './geo';

describe('coordinate validation', () => {
  test('accepts valid coordinates including the equator/meridian', () => {
    expect(isValidCoordinate(-26.2, 28.04)).toBe(true);
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(90, 180)).toBe(true);
  });

  test('rejects out-of-range, non-numeric and non-finite values', () => {
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, -181)).toBe(false);
    expect(isValidCoordinate('1', '2')).toBe(false);
    expect(isValidCoordinate(NaN, 1)).toBe(false);
    expect(isValidCoordinate(undefined, undefined)).toBe(false);
    expect(isValidCoordinate(Infinity, 1)).toBe(false);
  });

  test('getIncidentCoords never invents coordinates from an address', () => {
    expect(getIncidentCoords({ address: '1 Main Street' })).toBeNull();
    expect(getIncidentCoords({ latitude: 10 })).toBeNull();
    expect(getIncidentCoords(null)).toBeNull();
    expect(getIncidentCoords({ latitude: -26, longitude: 28 })).toEqual({ lat: -26, lng: 28 });
  });

  test('partitionByCoords separates plottable incidents and counts the rest', () => {
    const list = [
      { incidentId: 'a', latitude: 1, longitude: 2 },
      { incidentId: 'b', address: 'only an address' },
      { incidentId: 'c', latitude: 200, longitude: 2 },
    ];
    const { plotted, missing } = partitionByCoords(list);
    expect(plotted.map((p) => p.incident.incidentId)).toEqual(['a']);
    expect(missing).toBe(2);
  });
});

describe('requestCurrentPosition', () => {
  const original = Object.getOwnPropertyDescriptor(global.navigator, 'geolocation');
  afterEach(() => {
    if (original) Object.defineProperty(global.navigator, 'geolocation', original);
    else delete global.navigator.geolocation;
  });

  const setGeo = (value) =>
    Object.defineProperty(global.navigator, 'geolocation', { value, configurable: true });

  test('rejects with a helpful message when unsupported', async () => {
    setGeo(undefined);
    await expect(requestCurrentPosition()).rejects.toMatchObject({ code: 'unsupported' });
  });

  test('resolves with rounded coordinates on success', async () => {
    setGeo({
      getCurrentPosition: (ok) =>
        ok({ coords: { latitude: -26.20412345, longitude: 28.04731234, accuracy: 12 } }),
    });
    await expect(requestCurrentPosition()).resolves.toEqual({
      latitude: -26.204123,
      longitude: 28.047312,
      accuracy: 12,
    });
  });

  test('maps a permission denial to a manual-entry message', async () => {
    setGeo({ getCurrentPosition: (ok, fail) => fail({ code: 1 }) });
    await expect(requestCurrentPosition()).rejects.toMatchObject({
      code: 1,
      message: expect.stringContaining('type the address manually'),
    });
  });

  test('error messages exist for every failure code', () => {
    [1, 2, 3, 'unsupported', 'insecure', undefined].forEach((code) => {
      expect(geolocationErrorMessage({ code })).toEqual(expect.any(String));
    });
  });
});
