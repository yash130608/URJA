
const CACHE_NAME = "urja-v2";

const APP_FILES = [
  "/",
  "/static/manifest.webmanifest",
  "/static/css/styles.css",
  "/static/js/app.js",
  "/static/assets/urja-logo.svg",
  "/static/assets/urja-icon-192.png",
  "/static/assets/urja-icon-512.png"
];

// Install and cache the app's basic files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

// Remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Never cache API responses or personal data
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetch(request);
    })
  );
});
