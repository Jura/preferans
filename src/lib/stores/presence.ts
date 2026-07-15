import { writable } from 'svelte/store';

export type PresenceStatus = 'online' | 'away' | 'offline';

/** Activity inactivity thresholds matching server-side windows */
const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const AWAY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** How often to send a heartbeat to update last_active_at on the server */
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/** How often to re-evaluate and update the local presence status */
const STATUS_CHECK_INTERVAL_MS = 60_000; // 1 minute

function createPresenceStore() {
	const { subscribe, set } = writable<PresenceStatus>('online');

	let lastActivityAt = Date.now();
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let statusTimer: ReturnType<typeof setInterval> | null = null;
	let started = false;

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

	async function sendHeartbeat() {
		const status = computeStatus();
		set(status);
		// Only ping server if user has been active (online/away); skip if offline
		if (status !== 'offline') {
			try {
				await fetch('/api/presence', { method: 'PATCH' });
			} catch {
				// Ignore network errors – not critical
			}
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

		// Periodic heartbeat to keep last_active_at fresh on the server
		heartbeatTimer = setInterval(() => void sendHeartbeat(), HEARTBEAT_INTERVAL_MS);

		// Re-evaluate local status more frequently (catches transitions to away/offline)
		statusTimer = setInterval(() => set(computeStatus()), STATUS_CHECK_INTERVAL_MS);

		// Send first heartbeat immediately
		void sendHeartbeat();
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

	return { subscribe, start, stop };
}

export const presence = createPresenceStore();
