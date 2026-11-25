/**
 * Athena's service worker — the only part of the browser that can be running
 * when she has something to say and nobody has her open.
 *
 * It is deliberately small. A service worker that owns an offline cache owns
 * the app's update story too, and an assistant that silently serves a stale
 * build is a much worse failure than an assistant that needs a network. So the
 * first job is notifications, and the one cache below is narrow on purpose:
 *
 * Signal Relay (owner, 11-24) is the kids' Morse game for when the network is
 * gone, on a road trip. Only a kid's tablet asks for it ("keep-offline", sent
 * by the page while online): the app shell, the hashed build files that page
 * loaded, and Athena's recorded relay lines. Pages always come from the
 * network first; the kept shell is used only when the network fails or takes
 * too long, so an online tablet never sees an old build. Nothing under /api,
 * /auth, /ws or /unity is ever touched, and an adult's browser, which never
 * asks, keeps nothing.
 *
 * The payload is encrypted end to end (RFC 8291): the push service routes it
 * but cannot read it, so unlike the Android path there is no server-drawn
 * notification and this handler has to draw it.
 */

/* global self, clients */

const FALLBACK = {
	title: "Athena",
	body: "Something came up.",
};

self.addEventListener("install", () => {
	// Take over straight away rather than waiting for every tab to close.
	// Otherwise turning notifications on does nothing until the browser is
	// restarted, which reads exactly like the feature being broken.
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			// An older offline cache goes when its name changes.
			for (const name of await caches.keys()) if (name.startsWith("athena-offline-") && name !== OFFLINE_CACHE) await caches.delete(name);
			await self.clients.claim();
		})()
	);
});

const OFFLINE_CACHE = "athena-offline-v1";
const SHELL = "/";
// A slow car hotspot shouldn't leave a kid staring at a blank tab: past this,
// the kept shell is used (and the page itself still talks to the network).
const NAV_TIMEOUT_MS = 6000;
const KEEPABLE = /^\/(assets\/|voice\/relay\/)/;

self.addEventListener("message", (event) => {
	const msg = event.data || {};
	if (msg.type !== "keep-offline" || !Array.isArray(msg.urls)) return;
	const urls = msg.urls.filter((u) => typeof u === "string" && KEEPABLE.test(u)).slice(0, 200);
	event.waitUntil(
		(async () => {
			const cache = await caches.open(OFFLINE_CACHE);
			// The shell fresh from the server, so it matches the build files beside it.
			const shell = await fetch(SHELL, { cache: "no-store", credentials: "same-origin" }).catch(() => null);
			if (shell && shell.ok && (shell.headers.get("content-type") || "").includes("text/html")) await cache.put(SHELL, shell);
			for (const url of urls) {
				if (await cache.match(url, { ignoreVary: true })) continue;
				const res = await fetch(url, { credentials: "same-origin" }).catch(() => null);
				if (res && res.ok) await cache.put(url, res);
			}
		})()
	);
});

self.addEventListener("fetch", (event) => {
	const req = event.request;
	if (req.method !== "GET") return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;

	if (req.mode === "navigate") {
		event.respondWith(
			(async () => {
				const kept = await caches.open(OFFLINE_CACHE).then((c) => c.match(SHELL, { ignoreVary: true })).catch(() => null);
				if (!kept) return fetch(req);
				let timer;
				const late = new Promise((resolve) => { timer = setTimeout(() => resolve(kept), NAV_TIMEOUT_MS); });
				const live = fetch(req).then((res) => { clearTimeout(timer); return res; }, () => { clearTimeout(timer); return kept; });
				return Promise.race([live, late]);
			})()
		);
		return;
	}

	// Only what a kid's tablet asked to keep is answered from here. Hashed build
	// files never change and her lines are versioned, so those come from the
	// cache first; anything else in /assets (her avatar, art) is network first.
	if (KEEPABLE.test(url.pathname)) {
		const fixed = url.pathname.startsWith("/voice/relay/") || /-[A-Za-z0-9_-]{8,}\.(js|css|woff2?)$/.test(url.pathname);
		const fromCache = () => caches.open(OFFLINE_CACHE).then((c) => c.match(req, { ignoreSearch: true, ignoreVary: true }));
		event.respondWith(
			fixed
				? fromCache().then((hit) => hit || fetch(req)).catch(() => fetch(req))
				: fetch(req).catch(() => fromCache().then((hit) => hit || Response.error()))
		);
	}
});

self.addEventListener("push", (event) => {
	let payload = FALLBACK;
	try {
		const parsed = event.data ? event.data.json() : null;
		if (parsed && typeof parsed.title === "string") payload = parsed;
	} catch {
		// A push we cannot read still has to produce a notification: browsers
		// revoke the permission of a worker that receives a push and shows
		// nothing, so failing quietly here would eventually turn Athena off.
	}

	const data = payload.data || {};
	event.waitUntil(
		self.registration.showNotification(payload.title || FALLBACK.title, {
			body: payload.body || FALLBACK.body,
			// The avatar that already ships, rather than a purpose-made icon
			// that does not exist yet: a 404 here leaves the notification
			// wearing the browser's own logo, which reads as a site nagging
			// you rather than as Athena.
			icon: "/assets/athena-avatar.png",
			// Per nudge, not per app. A shared tag would make a second
			// notification REPLACE the first in the tray — which was fine when
			// an interruption budget guaranteed she spoke at most once every
			// ninety minutes, and is a silent way to lose things now that she
			// can raise two at once. A redelivery of the same nudge still
			// collapses onto itself, because the uuid is the same.
			tag: data.uuid ? `${data.kind === "trading" ? "trading" : "nudge"}-${data.uuid}` : data.kind === "test" ? "athena-test" : "athena",
			renotify: true,
			// The person's own choice in Trading → Settings → Notifications.
			silent: data.silent === "1",
			data,
		})
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	// A notification may name the page it is about (a trading setup carries
	// /family/trading?setup=…). Only same-origin paths are honoured, so a
	// payload can never send the browser anywhere else.
	const data = event.notification.data || {};
	const path = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/";
	const target = new URL(path, self.location.origin).href;

	event.waitUntil(
		(async () => {
			const open = await clients.matchAll({ type: "window", includeUncontrolled: true });
			for (const client of open) {
				if (client.url.startsWith(self.location.origin)) {
					// Already on the page the notification names: hand it over
					// (the page re-checks the setup). Elsewhere: go there.
					if (path !== "/" && !client.url.startsWith(new URL(path.split("?")[0], self.location.origin).href) && "navigate" in client) {
						return client.focus().then((c) => c.navigate(target)).catch(() => clients.openWindow(target));
					}
					// Hand the tab the nudge as well as the focus, so she can
					// open what she was talking about rather than the person
					// arriving at a home screen and having to find it.
					client.postMessage({ type: "athena-notification-click", data: event.notification.data });
					return client.focus();
				}
			}
			return clients.openWindow(target);
		})()
	);
});
