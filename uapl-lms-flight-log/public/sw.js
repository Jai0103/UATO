/* Apollo Flight Management System service worker */

const CACHE_VERSION = "v3";
const CACHE_NAME = `apollo-fms-static-${CACHE_VERSION}`;
const APP_SCOPE = new URL(self.registration.scope);
const BASE_PATH = APP_SCOPE.pathname.replace(/\/$/, "");

const OFFLINE_URL = `${BASE_PATH}/offline.html`;
const PRECACHE_URLS = [
  OFFLINE_URL,
  `${BASE_PATH}/manifest.webmanifest`,
  `${BASE_PATH}/apollo-global-academy-logo.png`,
  `${BASE_PATH}/AGA_Logo_Square%20(1).jpg`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith("apollo-fms-") && key !== CACHE_NAME
              )
              .map((key) => caches.delete(key))
          )
        ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Google Apps Script and other external requests must always remain live.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkNavigation(request));
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

async function networkNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return (
      (await caches.match(OFFLINE_URL)) ||
      new Response("The application is currently offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

function isStaticAsset(request, url) {
  const staticDestinations = new Set([
    "font",
    "image",
    "script",
    "style",
    "worker",
  ]);

  return (
    staticDestinations.has(request.destination) ||
    url.pathname.startsWith(`${BASE_PATH}/_next/static/`) ||
    url.pathname === `${BASE_PATH}/manifest.webmanifest`
  );
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const networkResponsePromise = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cachedResponse) {
    event.waitUntil(networkResponsePromise.then(() => undefined));
    return cachedResponse;
  }

  const networkResponse = await networkResponsePromise;
  if (networkResponse) return networkResponse;

  return new Response("Resource unavailable while offline.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
