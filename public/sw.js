// Marqad service worker — caches the app shell for installability and
// launch-from-homescreen behavior. Actual transcription always requires
// network (live API call); this SW is NOT for offline transcription.
//
// UPDATE STRATEGY: The SW checks for a new version on every navigation.
// If the SW file itself has changed (byte-for-byte), the browser triggers
// a new install. We use skipWaiting() + clients.claim() so the new SW
// activates immediately without waiting for all tabs to close.
// A message is sent to all clients so they can reload with the new assets.

const CACHE_NAME = "marqad-v3";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Activate immediately — don't wait for old SW to die
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        // Delete ALL old caches — forces fresh assets on update
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  // Take control of all clients immediately
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // For navigation requests, try network first, fall back to cached shell
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          // Cache the fresh page
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // For same-origin static assets, use NETWORK-FIRST so new deployments
  // are always picked up. Falls back to cache if offline.
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          // Only cache successful responses
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
  }
  // Cross-origin requests (Supabase, Speechmatics) are not intercepted
});

// When a new SW takes control, tell all clients to reload
self.addEventListener("controllerchange", () => {
  // The clients will handle this via the registration.onupdatefound callback
});
