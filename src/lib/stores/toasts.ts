import { writable } from 'svelte/store';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
	duration?: number;
}

const DEFAULT_DURATION_MS = 5000;

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	function add(toast: Omit<Toast, 'id'>): string {
		const id = crypto.randomUUID();
		const full: Toast = { duration: DEFAULT_DURATION_MS, ...toast, id };
		update((ts) => [...ts, full]);
		if (full.duration && full.duration > 0) {
			setTimeout(() => remove(id), full.duration);
		}
		return id;
	}

	function remove(id: string) {
		update((ts) => ts.filter((t) => t.id !== id));
	}

	return { subscribe, add, remove };
}

export const toasts = createToastStore();
