const SITE_CACHE_NAME = 'bhavishya-site-assets-v5';
const MAX_IMAGE_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_CACHE_BYTES = 5 * 1024 * 1024;
const MEDIA_FILE_PATTERN = /\.(?:mp4|webm|mov|avi|mkv|mpeg|mpg|m4v|3gp|wmv|mp3|wav|ogg|m4a|aac|flac|aiff?|opus)(?:$|[?#])/i;
const STATIC_FILE_PATTERN = /\.(?:html?|css|js|mjs|json|xml|txt|avif|gif|jpe?g|png|svg|webp|ico|woff2?|ttf|otf|eot)(?:$|[?#])/i;

function getCacheLimit(requestUrl) {
  return /\.(?:avif|gif|jpe?g|png|svg|webp|ico)(?:$|[?#])/i.test(requestUrl)
    ? MAX_IMAGE_CACHE_BYTES
    : MAX_ASSET_CACHE_BYTES;
}

function isCacheableRequest(request) {
  if (request.method !== 'GET' || request.headers.has('range') || request.headers.has('authorization')) {
    return false;
  }

  const requestUrl = new URL(request.url);
  if (MEDIA_FILE_PATTERN.test(requestUrl.pathname) || !STATIC_FILE_PATTERN.test(requestUrl.pathname)) {
    return false;
  }

  if (request.mode === 'navigate') {
    return requestUrl.origin === self.location.origin;
  }

  return requestUrl.origin === self.location.origin ||
    (requestUrl.protocol === 'https:' && request.mode === 'cors' && request.credentials !== 'include');
}

async function saveToSiteCache(cache, request, response) {
  if (!response.ok || response.type === 'opaque') {
    return;
  }

  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = Number(contentLengthHeader);
  if (!contentLengthHeader || !Number.isFinite(contentLength) || contentLength > getCacheLimit(request.url)) {
    return;
  }

  try {
    await cache.put(request, response);
  } catch (error) {
    console.warn('[Site cache] Could not store response:', request.url, error);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((cacheName) => cacheName.startsWith('bhavishya-site-assets-') && cacheName !== SITE_CACHE_NAME)
      .map((cacheName) => caches.delete(cacheName)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!isCacheableRequest(request)) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(SITE_CACHE_NAME);

    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        await saveToSiteCache(cache, request, response.clone());
        return response;
      } catch (error) {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        throw error;
      }
    }

    if (/\.(?:m?js)$/i.test(new URL(request.url).pathname)) {
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        await saveToSiteCache(cache, request, response.clone());
        return response;
      } catch (error) {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        throw error;
      }
    }

    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      event.waitUntil((async () => {
        try {
          const response = await fetch(request);
          await saveToSiteCache(cache, request, response.clone());
        } catch (error) {
          console.warn('[Site cache] Could not refresh response:', request.url, error);
        }
      })());
      return cachedResponse;
    }

    const response = await fetch(request);
    await saveToSiteCache(cache, request, response.clone());
    return response;
  })());
});
