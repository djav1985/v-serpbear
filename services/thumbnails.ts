export type ThumbnailPart = { id: number; blob: Blob; contentType: string; generatedAt: number };

const CACHE_NAME = 'serpbear-domain-thumbnails-v1';
const CACHE_PATH = '/__serpbear_thumbnail_cache__/';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const CRLF = new Uint8Array([13, 10]);
const HEADER_END = new Uint8Array([13, 10, 13, 10]);

const concatBytes = (left: Uint8Array, right: Uint8Array): Uint8Array => {
   const joined = new Uint8Array(left.length + right.length);
   joined.set(left);
   joined.set(right, left.length);
   return joined;
};

const indexOfBytes = (source: Uint8Array, needle: Uint8Array, from = 0): number => {
   outer: for (let index = from; index <= source.length - needle.length; index += 1) {
      for (let offset = 0; offset < needle.length; offset += 1) {
         if (source[index + offset] !== needle[offset]) { continue outer; }
      }
      return index;
   }
   return -1;
};

const beginsWith = (source: Uint8Array, prefix: Uint8Array): boolean => (
   source.length >= prefix.length && prefix.every((byte, index) => source[index] === byte)
);

const cacheKey = (id: number): string => {
   const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
   return new URL(`${CACHE_PATH}${id}`, origin).toString();
};

const openThumbnailCache = async (): Promise<Cache | undefined> => {
   if (typeof globalThis.caches === 'undefined') { return undefined; }
   try { return await globalThis.caches.open(CACHE_NAME); } catch { return undefined; }
};

const validId = (id: number): boolean => Number.isSafeInteger(id) && id > 0;

/** Reads a generation-time-expiring browser cache entry. Missing or evicted Cache Storage is a cache miss. */
export const readCachedThumbnail = async (id: number, now: number = Date.now()): Promise<ThumbnailPart | undefined> => {
   if (!validId(id)) { return undefined; }
   const cache = await openThumbnailCache();
   if (!cache) { return undefined; }
   const key = cacheKey(id);
   let response: Response | undefined;
   try { response = await cache.match(key); } catch { return undefined; }
   if (!response) { return undefined; }
   const generatedAt = Date.parse(response.headers.get('X-Generated-At') || '');
   if (!Number.isFinite(generatedAt) || now >= generatedAt + THIRTY_DAYS_MS) {
      await cache.delete(key).catch(() => false);
      return undefined;
   }
   const blob = await response.blob();
   const contentType = response.headers.get('Content-Type') || blob.type;
   if (!contentType.toLowerCase().startsWith('image/') || blob.size === 0) {
      await cache.delete(key).catch(() => false);
      return undefined;
   }
   return { id, blob, contentType, generatedAt };
};

const parseBoundary = (contentType: string): string | undefined => {
   const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
   return (match?.[1] || match?.[2])?.trim();
};

const parseHeaders = (text: string): { id: number; contentType: string; generatedAt: number; contentLength: number } | undefined => {
   const headers = new Map<string, string>();
   text.split('\r\n').forEach((line) => {
      const colon = line.indexOf(':');
      if (colon > 0) { headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()); }
   });
   const idText = /^<?(\d+)>?$/.exec(headers.get('content-id') || '')?.[1];
   const id = idText ? Number(idText) : NaN;
   const contentType = headers.get('content-type') || '';
   const generatedAt = Date.parse(headers.get('x-generated-at') || '');
   const contentLength = Number(headers.get('content-length'));
   if (!validId(id) || !contentType.toLowerCase().startsWith('image/') || !Number.isSafeInteger(contentLength) || contentLength <= 0 || !Number.isFinite(generatedAt)) {
      return undefined;
   }
   return { id, contentType, generatedAt, contentLength };
};

const publishCompleteParts = async (
   reader: ReadableStreamDefaultReader<Uint8Array>,
   boundary: string,
   cache: Cache | undefined,
   onPart: (part: ThumbnailPart) => void,
): Promise<void> => {
   const encoder = new TextEncoder();
   const decoder = new TextDecoder();
   const marker = encoder.encode(`--${boundary}\r\n`);
   const closing = encoder.encode(`--${boundary}--\r\n`);
   let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

   while (true) {
      const { done, value } = await reader.read();
      if (done) { break; }
      if (value?.length) { buffer = concatBytes(buffer, value); }
      while (buffer.length) {
         if (beginsWith(buffer, closing)) { return; }
         if (buffer.length < marker.length && marker.slice(0, buffer.length).every((byte, index) => buffer[index] === byte)) { break; }
         if (!beginsWith(buffer, marker)) { return; }
         const headersStart = marker.length;
         const headersEnd = indexOfBytes(buffer, HEADER_END, headersStart);
         if (headersEnd < 0) { break; }
         const partHeaders = parseHeaders(decoder.decode(buffer.slice(headersStart, headersEnd)));
         if (!partHeaders) { return; }
         const payloadStart = headersEnd + HEADER_END.length;
         const payloadEnd = payloadStart + partHeaders.contentLength;
         if (buffer.length < payloadEnd + CRLF.length) { break; }
         if (buffer[payloadEnd] !== 13 || buffer[payloadEnd + 1] !== 10) { return; }
         const nextBoundary = buffer.slice(payloadEnd + CRLF.length);
         const hasFollowingDelimiter = beginsWith(nextBoundary, marker) || beginsWith(nextBoundary, closing);
         const partialFollowingDelimiter = [marker, closing].some((candidate) => (
            nextBoundary.length < candidate.length && candidate.slice(0, nextBoundary.length).every((byte, index) => nextBoundary[index] === byte)
         ));
         if (!hasFollowingDelimiter) {
            if (partialFollowingDelimiter) { break; }
            return;
         }

         const blob = new Blob([buffer.slice(payloadStart, payloadEnd)], { type: partHeaders.contentType });
         const part: ThumbnailPart = { id: partHeaders.id, blob, contentType: partHeaders.contentType, generatedAt: partHeaders.generatedAt };
         if (Date.now() < part.generatedAt + THIRTY_DAYS_MS && cache) {
            const cached = new Response(blob, { headers: { 'Content-Type': part.contentType, 'X-Generated-At': new Date(part.generatedAt).toISOString() } });
            await cache.put(cacheKey(part.id), cached).catch(() => undefined);
         }
         onPart(part);
         buffer = nextBoundary;
      }
   }
};

/** Fetches a batch from the authenticated same-origin route and publishes only fully received parts. */
export const fetchThumbnailBatch = async (ids: number[], onPart: (part: ThumbnailPart) => void): Promise<void> => {
   const uniqueIds = Array.from(new Set(ids.filter(validId)));
   if (uniqueIds.length === 0) { return; }
   const response = await fetch('/api/images/thumbnail', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'multipart/mixed' },
      body: JSON.stringify({ ids: uniqueIds }),
   });
   if (!response.ok || !response.body) { return; }
   const boundary = parseBoundary(response.headers.get('Content-Type') || '');
   if (!boundary) { return; }
   const cache = await openThumbnailCache();
   const reader = response.body.getReader();
   try { await publishCompleteParts(reader, boundary, cache, onPart); }
   finally { reader.releaseLock(); }
};
