/* ═══════════════════════════════════════════════════════════════════
   LangNation — service worker.

   Strategy, chosen so a deploy is never stuck behind a cache:
     · HTML  → network first, cache as backup   (always fresh; works offline)
     · CSS/JS/images/icons → cache first, refreshed in the background
     · POST and /api/ → never touched

   Bump CACHE on any change to the shell list below.
   ═══════════════════════════════════════════════════════════════════ */

const CACHE = "langnation-web-v43";

// Paths the service worker keeps its hands off entirely.
const PRIVATE = ["/community", "/de/community", "/admin", "/rootadmin", "/portal", "/teach"];

const SHELL = [
  "/",
  "/offline.html",
  "/css/site.css",
  "/js/app.js",
  "/manifest.webmanifest",
  // The PWA install icons, which the manifest names at these exact paths.
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  // Requested by the browser itself at this exact path, so it can carry no
  // version and has to be here by name.
  "/favicon.ico",
];

// The logo, the apple-touch icon and the favicon PNGs used to be listed
// above. They are not any more: every <img> and <link> that asks for them
// now carries ?v=<assetVersion>, so the request URL never matches a
// bare-path precache entry and these were bytes downloaded on install and
// then never read. The runtime cache picks them up on the first visit,
// which is the same visit that would have warmed them anyway.

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll fails the whole install if any single URL 404s, so add
      // them individually and tolerate misses.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
  );
  // Deliberately NOT skipWaiting() here.
  //
  // Taking over the moment it installs sounds like the fast option and is
  // the reason a deploy used to go unnoticed: the new worker activates,
  // the open page carries on showing the HTML and CSS it already had, and
  // nothing tells anyone to reload. The visitor sees the old site and has
  // no way to know a new one exists.
  //
  // So this one waits, the page notices it waiting and offers "a new
  // version is ready", and skipWaiting happens below when somebody
  // actually asks for it. The reload is then something the reader chose,
  // not something that happened underneath them mid-sentence.
});

// The page asking to be updated now.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // fonts, analytics
  if (url.pathname.startsWith("/api/")) return;          // always live
  // Private pages: never cached, never served from cache. /admin was
  // listed here but /rootadmin and /portal were not, so the content
  // editor and a signed-in student's pages were being written to disk —
  // stale on the next visit, and readable by the next person to use the
  // machine.
  if (PRIVATE.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) return;

  const isHTML =
    req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("/offline.html") || caches.match("/"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          // A 304 carries no body. Returned from here it reaches the page
          // as an empty stylesheet or script, which is worse than any
          // cache miss — the page renders with no CSS at all. Ask again
          // without the validators instead.
          if (res && res.status === 304) {
            return cached ? cached.clone() : fetch(req, { cache: "reload" });
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
