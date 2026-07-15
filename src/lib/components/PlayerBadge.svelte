<script lang="ts">
	import { t } from '$lib/i18n';

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
		/** Extra CSS class(es) forwarded to the wrapper element. */
		class?: string;
	}

	let { playerId, name, stats = null, offline = false, class: className = '' }: Props = $props();

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
		color: #d9d9d9;
		background: rgba(130, 130, 130, 0.3);
		border: 1px solid rgba(170, 170, 170, 0.45);
	}

	.tooltip {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		min-width: 200px;
		max-width: 260px;
		background: rgba(15, 15, 30, 0.97);
		border: 1px solid rgba(200, 169, 110, 0.5);
		border-radius: 8px;
		padding: 10px 12px;
		z-index: 1000;
		pointer-events: none;
		animation: fadeIn 0.15s ease;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
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
		color: #c0b090;
		font-size: 13px;
	}

	.tooltip-name {
		font-weight: bold;
		font-size: 14px;
		color: #ffd700;
		margin-bottom: 2px;
	}

	.tooltip-email {
		font-size: 12px;
		color: #c0b090;
		margin-bottom: 6px;
		border-bottom: 1px solid rgba(200, 169, 110, 0.2);
		padding-bottom: 6px;
	}

	.tooltip-row {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 12px;
		color: #d8ccb2;
		line-height: 1.6;
	}

	.tooltip-label {
		color: #c8a96e;
		white-space: nowrap;
	}

	.tooltip-value {
		color: #f0e6d3;
		font-weight: 600;
	}
</style>
