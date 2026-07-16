const VERSION = "uapl-fms-2026-07-16-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const BASE_PATH = "/UATO";

const CORE_ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/manifest.webmanifest`,
  `${BASE_PATH}/offline.html`,
  `${BASE_PATH}/AGA_Logo_fullcolor_Horizontal (1).png`
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.allSettled(
        CORE_ASSETS.map((asset) => cache.add(asset))
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("uapl-fms-") &&
                key !== STATIC_CACHE &&
                key !== PAGE_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(`${BASE_PATH}/`)) return;

  if (
    url.pathname.includes("/api/") ||
    url.hostname.includes("script.google.com")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match(`${BASE_PATH}/`)) ||
            caches.match(`${BASE_PATH}/offline.html`)
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkRequest = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(
          () =>
            cached ||
            new Response("Resource unavailable while offline.", {
              status: 503,
              headers: {
                "Content-Type": "text/plain; charset=utf-8"
              }
            })
        );

      return cached || networkRequest;
    })
  );
});
