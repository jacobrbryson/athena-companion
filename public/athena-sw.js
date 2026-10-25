/**
 * Athena's service worker — the only part of the browser that can be running
 * when she has something to say and nobody has her open.
 *
 * It is deliberately tiny and does no caching. A service worker that also owns
 * an offline cache owns the app's update story too, and an assistant that
 * silently serves a stale build is a much worse failure than an assistant that
 * needs a network. The one job here is notifications.
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
	event.waitUntil(self.clients.claim());
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
