<script lang="ts">
	import { toasts } from '$lib/stores/toasts';
	import type { Toast } from '$lib/stores/toasts';

	const ICONS: Record<Toast['type'], string> = {
		info: 'ℹ️',
		success: '✅',
		warning: '⚠️',
		error: '❌'
	};
</script>

{#if $toasts.length > 0}
	<div class="toast-container" aria-live="polite" aria-label="Notifications">
		{#each $toasts as toast (toast.id)}
			<div class="toast toast--{toast.type}" role="status">
				<span class="toast-icon" aria-hidden="true">{ICONS[toast.type]}</span>
				<span class="toast-message">{toast.message}</span>
				<button
					class="toast-close"
					onclick={() => toasts.remove(toast.id)}
					aria-label="Dismiss notification">✕</button
				>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		bottom: 24px;
		right: 24px;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 10px;
		max-width: min(380px, calc(100vw - 32px));
	}

	.toast {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--radius-md);
		background: var(--surface-menu);
		border: 1px solid var(--border-gold-soft);
		box-shadow: var(--shadow-lg);
		animation: slide-in var(--dur-med) var(--ease-out);
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.toast--success {
		border-color: rgba(102, 217, 140, 0.5);
	}

	.toast--warning {
		border-color: rgba(255, 198, 92, 0.5);
	}

	.toast--error {
		border-color: rgba(255, 128, 128, 0.5);
	}

	.toast-icon {
		font-size: 16px;
		flex-shrink: 0;
		line-height: 1.5;
	}

	.toast-message {
		flex: 1;
		font-size: var(--text-base);
		color: var(--cream-200);
		line-height: 1.5;
	}

	.toast-close {
		background: none;
		border: none;
		color: var(--muted);
		cursor: pointer;
		font-size: 14px;
		padding: 0;
		line-height: 1.5;
		flex-shrink: 0;
		transition: color 0.15s;
	}

	.toast-close:hover {
		color: var(--cream-200);
	}

	@media (max-width: 480px) {
		.toast-container {
			bottom: 16px;
			right: 16px;
			left: 16px;
		}
	}
</style>
