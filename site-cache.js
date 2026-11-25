(function () {
  const scriptUrl = document.currentScript && document.currentScript.src;
  if (!scriptUrl || !window.isSecureContext || !('serviceWorker' in navigator) || !('caches' in window)) {
    return;
  }

  const siteRoot = new URL('./', scriptUrl);
  const cacheName = 'bhavishya-site-assets-v5';
  const mediaPattern = /\.(?:mp4|webm|mov|avi|mkv|mpeg|mpg|m4v|3gp|wmv|mp3|wav|ogg|m4a|aac|flac|aiff?|opus)(?:$|[?#])/i;
  const imagePattern = /\.(?:avif|gif|jpe?g|png|svg|webp|ico)(?:$|[?#])/i;
  const staticPattern = /\.(?:html?|css|js|mjs|json|xml|txt|avif|gif|jpe?g|png|svg|webp|ico|woff2?|ttf|otf|eot)(?:$|[?#])/i;
  const maxImageBytes = 2 * 1024 * 1024;
  const maxAssetBytes = 5 * 1024 * 1024;
  let prefetchBudget = 75 * 1024 * 1024;
  const pageConcurrency = 2;
  const assetConcurrency = 2;
  let prefetchedBytes = 0;
  let manifestPagePaths = new Set();

  function resolveCacheableUrl(value, baseUrl) {
    if (!value || value.charAt(0) === '#' || /^\s*(?:data:|blob:|javascript:)/i.test(value)) {
      return null;
    }

    let url;
    try {
      url = new URL(value, baseUrl);
    } catch (error) {
      return null;
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    if (url.origin !== window.location.origin || mediaPattern.test(url.pathname) || !staticPattern.test(url.pathname)) {
      return null;
    }
    if (/\.html?$/i.test(url.pathname) && !manifestPagePaths.has(url.pathname)) {
      return null;
    }

    url.hash = '';
    return url;
  }

  function getCacheLimit(url) {
    return imagePattern.test(url.pathname) ? maxImageBytes : maxAssetBytes;
  }

  async function cacheResponse(cache, url, response, expectedSize) {
    if (!response.ok || response.type === 'opaque') {
      return 0;
    }

    const sizeHeader = response.headers.get('content-length');
    const size = sizeHeader ? Number(sizeHeader) : expectedSize;
    if (!Number.isFinite(size) || size < 0 || size > getCacheLimit(url) || prefetchedBytes + size > prefetchBudget) {
      return 0;
    }

    try {
      await cache.put(url.href, response.clone());
      prefetchedBytes += size;
      return size;
    } catch (error) {
      console.warn('[Site cache] Could not store response:', url.href, error);
      return 0;
    }
  }

  async function fetchForCache(cache, url, checkSizeBeforeFetch) {
    const cachedResponse = await cache.match(url.href);
    if (cachedResponse) {
      return cachedResponse;
    }

    let expectedSize;
    if (checkSizeBeforeFetch) {
      const headResponse = await fetch(url.href, {
        method: 'HEAD',
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const sizeHeader = headResponse.headers.get('content-length');
      const size = Number(sizeHeader);
      if (!headResponse.ok || !sizeHeader || !Number.isFinite(size) ||
          size > getCacheLimit(url) || prefetchedBytes + size > prefetchBudget) {
        return null;
      }
      expectedSize = size;
    }

    const response = await fetch(url.href, { credentials: 'same-origin', cache: 'reload' });
    await cacheResponse(cache, url, response, expectedSize);
    return response;
  }

  function addCssUrls(cssText, cssUrl, targetSet) {
    const urlPattern = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    let match;
    while ((match = urlPattern.exec(cssText))) {
      const url = resolveCacheableUrl(match[2], cssUrl);
      if (url) {
        targetSet.add(url.href);
      }
    }
  }

  function collectPageAssets(htmlText, pageUrl, targetSet) {
    const documentParser = new DOMParser();
    const parsedDocument = documentParser.parseFromString(htmlText, 'text/html');
    const attributes = ['src', 'href', 'poster'];

    parsedDocument.querySelectorAll('img[srcset], source[srcset]').forEach((element) => {
      element.getAttribute('srcset').split(',').forEach((candidate) => {
        const url = resolveCacheableUrl(candidate.trim().split(/\s+/)[0], pageUrl);
        if (url) {
          targetSet.add(url.href);
        }
      });
    });

    parsedDocument.querySelectorAll('*').forEach((element) => {
      attributes.forEach((attribute) => {
        const url = resolveCacheableUrl(element.getAttribute(attribute), pageUrl);
        if (url) {
          targetSet.add(url.href);
        }
      });

      const inlineStyle = element.getAttribute('style');
      if (inlineStyle) {
        addCssUrls(inlineStyle, pageUrl, targetSet);
      }
    });

    parsedDocument.querySelectorAll('style').forEach((element) => {
      addCssUrls(element.textContent, pageUrl, targetSet);
    });
  }

  async function processPage(cache, pageUrl, assetUrls) {
    try {
      const response = await fetchForCache(cache, pageUrl);
      if (!response.ok) {
        console.warn('[Site cache] Page could not be fetched:', pageUrl.href, response.status);
        return;
      }
      collectPageAssets(await response.text(), pageUrl, assetUrls);
    } catch (error) {
      console.warn('[Site cache] Page could not be prefetched:', pageUrl.href, error);
    }
  }

  async function processAsset(cache, assetUrl, assetUrls) {
    try {
      const response = await fetchForCache(cache, assetUrl, true);
      if (!response || !response.ok) {
        return;
      }

      if (/\.css(?:$|[?#])/i.test(assetUrl.pathname)) {
        addCssUrls(await response.text(), assetUrl, assetUrls);
      }
    } catch (error) {
      console.warn('[Site cache] Asset could not be prefetched:', assetUrl.href, error);
    }
  }

  async function runConcurrent(items, concurrency, callback) {
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async function () {
      while (index < items.length && prefetchedBytes < prefetchBudget) {
        const item = items[index];
        index += 1;
        await callback(item);
      }
    });
    await Promise.all(workers);
  }

  async function prefetchSite() {
    const connection = navigator.connection;
    if (connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ''))) {
      return;
    }

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage)) {
          prefetchBudget = Math.max(0, Math.min(prefetchBudget, estimate.quota - estimate.usage - 15 * 1024 * 1024));
        }
      } catch (error) {
        console.warn('[Site cache] Storage estimate failed:', error);
      }
    }

    if (prefetchBudget === 0) {
      return;
    }

    const cache = await caches.open(cacheName);
    const assetUrls = new Set();
    try {
      const manifestResponse = await fetch(new URL('site-cache-manifest.json', siteRoot).href, {
        credentials: 'same-origin',
        cache: 'reload'
      });
      if (!manifestResponse.ok) {
        throw new Error('Manifest request failed with status ' + manifestResponse.status);
      }

      const manifest = await manifestResponse.json();
      const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
      const pageUrls = pages.map((page) => new URL(page, siteRoot));
      manifestPagePaths = new Set(pageUrls.map((pageUrl) => pageUrl.pathname));
      await runConcurrent(pageUrls, pageConcurrency, (pageUrl) => processPage(cache, pageUrl, assetUrls));

      const processedAssetUrls = new Set();
      while (prefetchedBytes < prefetchBudget) {
        const pendingAssetUrls = Array.from(assetUrls)
          .filter((url) => !processedAssetUrls.has(url))
          .map((url) => new URL(url));
        if (pendingAssetUrls.length === 0) {
          break;
        }
        pendingAssetUrls.forEach((url) => processedAssetUrls.add(url.href));
        await runConcurrent(pendingAssetUrls, assetConcurrency, (assetUrl) => processAsset(cache, assetUrl, assetUrls));
      }
    } catch (error) {
      console.warn('[Site cache] Automatic site prefetch failed:', error);
    }
  }

  navigator.serviceWorker.register(new URL('firebase-messaging-sw.js', siteRoot).pathname, {
    scope: siteRoot.pathname
  }).then(function () {
    return navigator.serviceWorker.ready;
  }).then(function () {
    const schedulePrefetch = function () {
      const startPrefetch = function () {
        prefetchSite();
      };

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(startPrefetch, { timeout: 30000 });
      } else {
        window.setTimeout(startPrefetch, 10000);
      }
    };

    const loaderCacheReady = window.ChatLoader && window.ChatLoader.cacheReady;
    Promise.resolve(loaderCacheReady).then(function () {
      if (!window.ChatLoader || typeof window.ChatLoader.start !== 'function') {
        schedulePrefetch();
        return;
      }

      let loaderStarted = false;
      let scheduled = false;
      const scheduleOnce = function () {
        if (scheduled) return;
        scheduled = true;
        window.clearTimeout(idleFallback);
        window.removeEventListener('chatloader:start', onLoaderStart);
        window.removeEventListener('chatloader:done', onLoaderDone);
        schedulePrefetch();
      };
      const onLoaderStart = function () {
        loaderStarted = true;
        window.clearTimeout(idleFallback);
      };
      const onLoaderDone = function () {
        scheduleOnce();
      };
      const idleFallback = window.setTimeout(function () {
        if (!loaderStarted) scheduleOnce();
      }, 60000);
      window.addEventListener('chatloader:start', onLoaderStart);
      window.addEventListener('chatloader:done', onLoaderDone);
    }, function (error) {
      console.warn('[Site cache] Loader cache did not finish:', error);
      schedulePrefetch();
    });
  }).catch(function (error) {
    console.warn('[Site cache] Service worker registration failed:', error);
  });
})();
