import { writable } from 'svelte/store';

export type PresenceStatus = 'online' | 'away' | 'offline';

/** Activity inactivity thresholds matching server-side windows */
const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const AWAY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** How often to evaluate local status and notify the active socket of user activity */
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/** How often to re-evaluate and update the local presence status */
const STATUS_CHECK_INTERVAL_MS = 60_000; // 1 minute

function createPresenceStore() {
	const { subscribe, set } = writable<PresenceStatus>('online');

	let lastActivityAt = Date.now();
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let statusTimer: ReturnType<typeof setInterval> | null = null;
	let started = false;
	/** Callback registered by the active WebSocket store (lobby or game) to send an activity message. */
	let activitySender: (() => void) | null = null;

	function computeStatus(): PresenceStatus {
		const elapsed = Date.now() - lastActivityAt;
		if (elapsed < ONLINE_THRESHOLD_MS) return 'online';
		if (elapsed < AWAY_THRESHOLD_MS) return 'away';
		return 'offline';
	}

	function recordActivity() {
		lastActivityAt = Date.now();
		set('online');
	}

	function sendHeartbeat() {
		const status = computeStatus();
		set(status);
		// Only signal the server if the user has been active (online/away); skip if offline.
		// The active socket store (lobby or game) owns the transport.
		if (status !== 'offline') {
			activitySender?.();
		}
	}

	/** Call once when the user is authenticated. Sets up activity listeners and timers. */
	function start() {
		if (typeof window === 'undefined' || started) return;
		started = true;

		const activityEvents: (keyof WindowEventMap)[] = [
			'mousedown',
			'mousemove',
			'keydown',
			'scroll',
			'touchstart',
			'wheel'
		];
		for (const ev of activityEvents) {
			window.addEventListener(ev, recordActivity, { passive: true });
		}

		// Periodic heartbeat to keep last_active_at fresh on the server via the active socket
		heartbeatTimer = setInterval(() => sendHeartbeat(), HEARTBEAT_INTERVAL_MS);

		// Re-evaluate local status more frequently (catches transitions to away/offline)
		statusTimer = setInterval(() => set(computeStatus()), STATUS_CHECK_INTERVAL_MS);

		// Send first heartbeat immediately
		sendHeartbeat();
	}

	/** Call when the user logs out or the app unmounts. */
	function stop() {
		if (!started) return;
		started = false;

		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
		if (statusTimer) {
			clearInterval(statusTimer);
			statusTimer = null;
		}
	}

	/**
	 * Register the function that the active WebSocket store (lobby or game) will use to
	 * send an `activity` message to the server. Pass `null` to unregister (e.g. on disconnect).
	 */
	function setActivitySender(fn: (() => void) | null) {
		activitySender = fn;
	}

	return { subscribe, start, stop, setActivitySender };
}

export const presence = createPresenceStore();
