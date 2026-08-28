<script lang="ts">
	import { t } from '$lib/i18n';
	import type { ConnectionQuality } from '$lib/types/preferans';

	interface PlayerStats {
		name: string;
		email: string;
		lastActiveAt: string | null;
		gamesPlayed: number;
		cumulativeScore: number;
		leaderboardRank: number;
	}

	interface Props {
		/** Player id – used to fetch stats lazily on first hover. */
		playerId: string;
		/** Display name shown inline. */
		name: string;
		/** Optional pre-loaded stats (skips the API fetch when provided). */
		stats?: PlayerStats | null;
		/** Marks the player as currently disconnected from the table. */
		offline?: boolean;
		/** Coarse connection health shown without exposing exact latency. */
		connectionQuality?: ConnectionQuality;
		/** Extra CSS class(es) forwarded to the wrapper element. */
		class?: string;
	}

	let {
		playerId,
		name,
		stats = null,
		offline = false,
		connectionQuality = offline ? 'offline' : 'good',
		class: className = ''
	}: Props = $props();

	let loaded = $state(false);
	let loading = $state(false);
	let fetchedStats: PlayerStats | null = $state(null);
	let showTooltip = $state(false);
	let tooltipTimer: ReturnType<typeof setTimeout> | null = null;

	// Unique id for aria-describedby wiring (stable for lifetime of component)
	let tooltipId = $derived(`player-tip-${playerId}`);

	// Effective stats: prefer pre-loaded prop, fall back to lazily fetched data
	let effectiveStats = $derived(stats ?? fetchedStats);

	function formatDate(iso: string | null): string {
		if (!iso) return $t('app.player.neverSeen');
		const d = new Date(iso);
		return d.toLocaleString();
	}

	async function fetchStats() {
		if (loaded || loading || stats) return;
		loading = true;
		try {
			const res = await fetch(`/api/users/${encodeURIComponent(playerId)}/stats`);
			if (res.ok) {
				fetchedStats = await res.json();
			}
		} catch {
			// silently ignore – tooltip just won't have rich data
		} finally {
			loading = false;
			loaded = true;
		}
	}

	function handleMouseEnter() {
		fetchStats();
		tooltipTimer = setTimeout(() => {
			showTooltip = true;
		}, 300);
	}

	function handleMouseLeave() {
		if (tooltipTimer) {
			clearTimeout(tooltipTimer);
			tooltipTimer = null;
		}
		showTooltip = false;
	}

	function handleFocus() {
		fetchStats();
		showTooltip = true;
	}

	function handleBlur() {
		showTooltip = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (showTooltip) {
				showTooltip = false;
			} else {
				handleFocus();
			}
		} else if (e.key === 'Escape') {
			showTooltip = false;
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
	class="player-badge {className}"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	onfocus={handleFocus}
	onblur={handleBlur}
	onkeydown={handleKeydown}
	tabindex="0"
	aria-describedby={showTooltip ? tooltipId : undefined}
>
	{name}
	{#if offline}
		<span class="status-chip offline">{$t('app.lobby.presence.offline')}</span>
	{:else if connectionQuality === 'poor' || connectionQuality === 'fair'}
		<span class="status-chip {connectionQuality}">
			{$t(`app.game.quality.${connectionQuality}`)}
		</span>
	{/if}
	{#if showTooltip}
		<div class="tooltip" role="tooltip" id={tooltipId}>
			{#if loading}
				<span class="tooltip-loading">…</span>
			{:else if effectiveStats}
				<div class="tooltip-row tooltip-name">{effectiveStats.name}</div>
				<div class="tooltip-row tooltip-email">{effectiveStats.email}</div>
				<div class="tooltip-row">
					<span class="tooltip-label">{$t('app.player.leaderboardRank')}:</span>
					<span class="tooltip-value">#{effectiveStats.leaderboardRank}</span>
				</div>
				<div class="tooltip-row">
					<span class="tooltip-label">{$t('app.player.gamesPlayed')}:</span>
					<span class="tooltip-value">{effectiveStats.gamesPlayed}</span>
				</div>
				<div class="tooltip-row">
					<span class="tooltip-label">{$t('app.player.cumulativeScore')}:</span>
					<span class="tooltip-value">{effectiveStats.cumulativeScore}</span>
				</div>
				<div class="tooltip-row">
					<span class="tooltip-label">{$t('app.player.lastSeen')}:</span>
					<span class="tooltip-value">{formatDate(effectiveStats.lastActiveAt)}</span>
				</div>
			{:else}
				<span class="tooltip-loading">{name}</span>
			{/if}
		</div>
	{/if}
</span>

<style>
	.player-badge {
		position: relative;
		display: inline-block;
		cursor: default;
		outline: none;
	}

	.status-chip {
		display: inline-block;
		margin-left: 6px;
		padding: 0 6px;
		font-size: 10px;
		line-height: 1.4;
		border-radius: 999px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}

	.status-chip.offline {
		color: var(--cream-400);
		background: rgba(130, 130, 130, 0.3);
		border: 1px solid rgba(170, 170, 170, 0.45);
	}

	.status-chip.fair {
		color: var(--warning);
		background: rgba(120, 85, 20, 0.35);
		border: 1px solid rgba(255, 198, 92, 0.45);
	}

	.status-chip.poor {
		color: var(--danger);
		background: rgba(139, 26, 26, 0.35);
		border: 1px solid rgba(255, 128, 128, 0.45);
	}

	.tooltip {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		min-width: 200px;
		max-width: 260px;
		background: var(--surface-menu);
		border: 1px solid var(--border-gold);
		border-radius: var(--radius-md);
		padding: 10px 12px;
		z-index: 1000;
		pointer-events: none;
		animation: fadeIn var(--dur-fast) var(--ease-out);
		box-shadow: var(--shadow-lg);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.tooltip-loading {
		color: var(--cream-500);
		font-size: var(--text-sm);
	}

	.tooltip-name {
		font-weight: bold;
		font-size: var(--text-base);
		color: var(--highlight);
		margin-bottom: 2px;
	}

	.tooltip-email {
		font-size: var(--text-sm);
		color: var(--cream-500);
		margin-bottom: 6px;
		border-bottom: 1px solid var(--border-gold-soft);
		padding-bottom: 6px;
	}

	.tooltip-row {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: var(--text-sm);
		color: var(--cream-400);
		line-height: 1.6;
	}

	.tooltip-label {
		color: var(--gold-400);
		white-space: nowrap;
	}

	.tooltip-value {
		color: var(--cream-200);
		font-weight: 600;
	}
</style>
