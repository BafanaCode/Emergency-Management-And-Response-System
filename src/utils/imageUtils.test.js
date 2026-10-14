import {
  getIncidentImageUrl,
  getCachedImageStatus,
  setCachedImageStatus,
  optimizeImageForUpload,
  uploadIncidentImage,
  validateImageFile,
  ImageProcessingError,
  MAX_IMAGE_FILE_BYTES,
  MAX_INLINE_IMAGE_CHARS
} from './imageUtils';
import * as storageModule from 'firebase/storage';

jest.mock('firebase/storage', () => ({
  ref: jest.fn((storage, path) => ({ storage, path })),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn()
}));

describe('imageUtils', () => {
  describe('getIncidentImageUrl', () => {
    test('extracts photoUrl correctly', () => {
      expect(getIncidentImageUrl({ photoUrl: 'https://example.com/photo.jpg' })).toBe('https://example.com/photo.jpg');
    });

    test('extracts imageUrl if photoUrl is missing', () => {
      expect(getIncidentImageUrl({ imageUrl: 'https://example.com/img.jpg' })).toBe('https://example.com/img.jpg');
    });

    test('extracts photo field if other keys are missing', () => {
      expect(getIncidentImageUrl({ photo: 'https://example.com/photo2.jpg' })).toBe('https://example.com/photo2.jpg');
    });

    test('extracts image field if other keys are missing', () => {
      expect(getIncidentImageUrl({ image: 'https://example.com/image3.jpg' })).toBe('https://example.com/image3.jpg');
    });

    test('extracts from photos array', () => {
      expect(getIncidentImageUrl({ photos: ['https://example.com/arr.jpg'] })).toBe('https://example.com/arr.jpg');
    });

    test('returns null for empty strings, null, or missing fields', () => {
      expect(getIncidentImageUrl(null)).toBeNull();
      expect(getIncidentImageUrl({})).toBeNull();
      expect(getIncidentImageUrl({ photoUrl: '' })).toBeNull();
      expect(getIncidentImageUrl({ photoUrl: '   ' })).toBeNull();
      expect(getIncidentImageUrl({ photoUrl: 'null' })).toBeNull();
      expect(getIncidentImageUrl({ photoUrl: 'undefined' })).toBeNull();
    });
  });

  describe('imageStatusCache', () => {
    test('caches and retrieves image statuses', () => {
      const url = 'https://example.com/test-cache.jpg';
      expect(getCachedImageStatus(url)).toBeNull();

      setCachedImageStatus(url, 'loaded');
      expect(getCachedImageStatus(url)).toBe('loaded');

      setCachedImageStatus(url, 'error');
      expect(getCachedImageStatus(url)).toBe('error');
    });
  });

  describe('uploadIncidentImage', () => {
    test('returns empty string if no file provided', async () => {
      const res = await uploadIncidentImage({}, null);
      expect(res).toBe('');
    });

    test('returns download URL when storage upload succeeds', async () => {
      const fakeStorage = {};
      const fakeFile = new Blob(['test-image'], { type: 'image/jpeg' });
      fakeFile.name = 'test.jpg';

      storageModule.uploadBytes.mockResolvedValueOnce({
        ref: { fullPath: 'incidents/123/photo.jpg' }
      });
      storageModule.getDownloadURL.mockResolvedValueOnce('https://storage.googleapis.com/download/test.jpg');

      const url = await uploadIncidentImage(fakeStorage, fakeFile);
      expect(url).toBe('https://storage.googleapis.com/download/test.jpg');
      expect(storageModule.uploadBytes).toHaveBeenCalled();
    });

    test('falls back gracefully to dataUrl when storage upload fails (e.g. quota exceeded)', async () => {
      const fakeStorage = {};
      const fakeFile = new Blob(['test-image'], { type: 'image/jpeg' });
      fakeFile.name = 'test.jpg';

      storageModule.uploadBytes.mockRejectedValueOnce(new Error('Quota exceeded (storage/quota-exceeded)'));

      const url = await uploadIncidentImage(fakeStorage, fakeFile);
      // In node environment without canvas, dataUrl is empty string or fallback dataUrl
      // and it does not throw
      expect(typeof url).toBe('string');
    });
  });

  describe('validateImageFile', () => {
    const fileOf = (type, size, name = 'x') => {
      const f = new Blob(['a'], { type });
      Object.defineProperty(f, 'size', { value: size });
      f.name = name;
      return f;
    };

    test('accepts JPEG, PNG and WebP within the size limit, and no file', () => {
      expect(validateImageFile(null).ok).toBe(true);
      expect(validateImageFile(fileOf('image/jpeg', 1000)).ok).toBe(true);
      expect(validateImageFile(fileOf('image/png', 1000)).ok).toBe(true);
      expect(validateImageFile(fileOf('image/webp', MAX_IMAGE_FILE_BYTES)).ok).toBe(true);
    });

    test('rejects non-image and unsupported types', () => {
      for (const type of ['application/pdf', 'text/html', 'image/svg+xml', 'image/gif', '']) {
        const res = validateImageFile(fileOf(type, 1000));
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/JPEG, PNG or WebP/);
      }
    });

    test('rejects oversized and empty files', () => {
      const big = validateImageFile(fileOf('image/jpeg', MAX_IMAGE_FILE_BYTES + 1));
      expect(big.ok).toBe(false);
      expect(big.error).toMatch(/too large/i);
      expect(validateImageFile(fileOf('image/jpeg', 0)).ok).toBe(false);
    });
  });

  describe('uploadIncidentImage failure handling', () => {
    beforeEach(() => {
      storageModule.uploadBytes.mockReset();
      storageModule.getDownloadURL.mockReset();
    });

    test('rejects an invalid file BEFORE attempting any upload', async () => {
      const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
      pdf.name = 'doc.pdf';
      await expect(uploadIncidentImage({}, pdf)).rejects.toBeInstanceOf(ImageProcessingError);
      expect(storageModule.uploadBytes).not.toHaveBeenCalled();
    });

    test('the inline fallback stays within the Firestore-safe budget', async () => {
      const file = new Blob(['test-image'], { type: 'image/jpeg' });
      file.name = 'test.jpg';
      storageModule.uploadBytes.mockRejectedValueOnce(new Error('Quota exceeded (storage/quota-exceeded)'));
      const url = await uploadIncidentImage({}, file);
      expect(url.startsWith('data:image/')).toBe(true);
      expect(url.length).toBeLessThanOrEqual(MAX_INLINE_IMAGE_CHARS);
    });

    test('when Storage fails AND compression fails, it throws instead of silently dropping the photo', async () => {
      // Force the real (non-jsdom) processing path; jsdom cannot decode images, so the
      // safety timeout yields an empty data URL - exactly the compression-failure case.
      const originalUA = window.navigator.userAgent;
      Object.defineProperty(window.navigator, 'userAgent', { value: 'Mozilla/5.0 Chrome', configurable: true });
      try {
        const file = new Blob(['not-really-an-image'], { type: 'image/jpeg' });
        file.name = 'broken.jpg';
        storageModule.uploadBytes.mockRejectedValueOnce(new Error('Quota exceeded (storage/quota-exceeded)'));
        await expect(uploadIncidentImage({}, file)).rejects.toThrow(/photo could not be processed/i);
      } finally {
        Object.defineProperty(window.navigator, 'userAgent', { value: originalUA, configurable: true });
      }
    }, 15000);
  });
});
