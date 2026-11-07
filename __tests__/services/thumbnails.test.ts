import { fetchThumbnailBatch, readCachedThumbnail } from '../../services/thumbnails';

const TTL = 30 * 24 * 60 * 60 * 1000;
const boundary = 'batch-boundary';

const bytes = (value: Buffer | string): Uint8Array => new Uint8Array(Buffer.from(value));
const concatenate = (chunks: Uint8Array[]): Uint8Array => {
   const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
   const joined = new Uint8Array(size);
   let offset = 0;
   chunks.forEach((chunk) => { joined.set(chunk, offset); offset += chunk.length; });
   return joined;
};

const part = (id: number, payload: number[], type = 'image/jpeg', generatedAt = '2026-11-07T12:00:00.000Z') => {
   const image = new Uint8Array(payload);
   return concatenate([
      bytes(`--${boundary}\r\nContent-ID: ${id}\r\nContent-Type: ${type}\r\nX-Generated-At: ${generatedAt}\r\nContent-Length: ${image.length}\r\n\r\n`),
      image,
      bytes('\r\n'),
   ]);
};

const responseFromChunks = (chunks: Uint8Array[]) => ({
   ok: true,
   headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? `multipart/mixed; boundary="${boundary}"` : null },
   body: {
      getReader: () => {
         let index = 0;
         return { read: async () => index < chunks.length
            ? { done: false, value: chunks[index++] }
            : { done: true, value: undefined }, releaseLock: jest.fn() };
      },
   },
});

const cachedResponse = (blob: Blob, generatedAt: number, contentType = 'image/jpeg') => ({
   headers: { get: (name: string) => name.toLowerCase() === 'x-generated-at'
      ? new Date(generatedAt).toISOString()
      : name.toLowerCase() === 'content-type' ? contentType : null },
   blob: jest.fn().mockResolvedValue(blob),
});

describe('thumbnail browser transport', () => {
   const originalFetch = global.fetch;
   const originalCaches = (globalThis as typeof globalThis & { caches?: CacheStorage }).caches;
   const cache = { match: jest.fn(), put: jest.fn(), delete: jest.fn() };

   beforeEach(() => {
      jest.clearAllMocks();
      cache.put.mockResolvedValue(undefined);
      cache.delete.mockResolvedValue(true);
      Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: jest.fn().mockResolvedValue(cache) } });
   });

   afterEach(() => {
      global.fetch = originalFetch;
      if (originalCaches === undefined) { delete (globalThis as unknown as { caches?: CacheStorage }).caches; }
      else { Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches }); }
   });

   it('returns a fresh cached image without making a network request', async () => {
      const generatedAt = Date.parse('2026-11-07T12:00:00.000Z');
      const blob = new Blob([new Uint8Array([1, 0, 255])], { type: 'image/jpeg' });
      cache.match.mockResolvedValue(cachedResponse(blob, generatedAt));
      global.fetch = jest.fn() as unknown as typeof fetch;

      const found = await readCachedThumbnail(4, generatedAt + TTL - 1);

      expect(found).toMatchObject({ id: 4, blob, contentType: 'image/jpeg', generatedAt });
      expect(global.fetch).not.toHaveBeenCalled();
   });

   it('deletes expired entries and treats unavailable Cache Storage as a miss', async () => {
      const generatedAt = Date.parse('2026-11-07T12:00:00.000Z');
      cache.match.mockResolvedValue(cachedResponse(new Blob(['old']), generatedAt));

      await expect(readCachedThumbnail(5, generatedAt + TTL)).resolves.toBeUndefined();
      expect(cache.delete).toHaveBeenCalledTimes(1);
      Object.defineProperty(globalThis, 'caches', { configurable: true, value: undefined });
      await expect(readCachedThumbnail(6, generatedAt)).resolves.toBeUndefined();
   });

   it('posts only requested IDs and publishes complete binary parts across arbitrary chunks', async () => {
      const wire = concatenate([
         part(8, [0, 255, 13, 10, 42]),
         part(3, [7, 0, 254], 'image/webp'),
         part(10, [11, 12], 'image/jpeg', '2026-01-01T00:00:00.000Z'),
         bytes(`--${boundary}--\r\n`),
      ]);
      const chunks = Array.from({ length: wire.length }, (_value, index) => wire.slice(index, index + 1));
      global.fetch = jest.fn().mockResolvedValue(responseFromChunks(chunks)) as unknown as typeof fetch;
      const received: number[] = [];

      await fetchThumbnailBatch([8, 3, 10], (value) => { received.push(value.id); });

      expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ ids: [8, 3, 10] });
      expect(received).toEqual([8, 3, 10]);
      expect(cache.put).toHaveBeenCalledTimes(2);
      const firstPart = (cache.put as jest.Mock).mock.calls[0][1];
      await expect(firstPart.blob()).resolves.toBeInstanceOf(Blob);
   });

   it('does not publish or cache an incomplete final MIME part', async () => {
      const complete = part(1, [3, 0, 255]);
      const incomplete = concatenate([
         bytes(`--${boundary}\r\nContent-ID: 2\r\nContent-Type: image/jpeg\r\nX-Generated-At: 2026-11-07T12:00:00.000Z\r\nContent-Length: 2\r\n\r\n`),
         bytes('xx\r\n'),
      ]);
      global.fetch = jest.fn().mockResolvedValue(responseFromChunks([concatenate([complete, incomplete])])) as unknown as typeof fetch;
      const received: number[] = [];

      await fetchThumbnailBatch([1, 2], ({ id }) => { received.push(id); });

      expect(received).toEqual([1]);
      expect(cache.put).toHaveBeenCalledTimes(1);
   });
});
