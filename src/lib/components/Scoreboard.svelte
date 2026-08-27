<script lang="ts">
	import { t } from '$lib/i18n';
	import PlayerBadge from './PlayerBadge.svelte';
	import type { Player, PlayerId } from '$lib/types/preferans';

	interface Props {
		pool: Record<PlayerId, number>;
		mountain: Record<PlayerId, number>;
		whists: Record<PlayerId, Record<PlayerId, number>>;
		scores: Record<PlayerId, number>;
		players: Player[];
		roundNumber: number;
		bulletTarget: number;
	}

	let { pool, mountain, whists, scores, players, roundNumber, bulletTarget }: Props = $props();

	function whistBalance(playerId: PlayerId): number {
		let balance = 0;
		for (const other of players) {
			if (other.id === playerId) continue;
			balance += (whists[playerId]?.[other.id] ?? 0) - (whists[other.id]?.[playerId] ?? 0);
		}
		return balance;
	}
</script>

<div class="scoreboard" aria-label={$t('app.scoreboard.aria')}>
	<h3 class="title">{$t('app.scoreboard.title', { roundNumber })}</h3>
	<table>
		<thead>
			<tr>
				<th>{$t('app.scoreboard.player')}</th>
				<th title={$t('app.scoreboard.poolHint', { bulletTarget })}
					>{$t('app.scoreboard.pool')}<br /><span class="pool-target">/{bulletTarget}</span></th
				>
				<th>{$t('app.scoreboard.mountain')}</th>
				<th>{$t('app.scoreboard.whists')}</th>
				<th>{$t('app.scoreboard.total')}</th>
			</tr>
		</thead>
		<tbody>
			{#each players as player}
				<tr>
					<td>
						{#if player.avatarUrl}
							<img src={player.avatarUrl} alt={player.name} class="avatar" width="24" height="24" />
						{/if}
						<PlayerBadge
							playerId={player.id}
							name={player.name}
							offline={player.isOnline === false}
						/>
					</td>
					<td class="num pool">
						<span class="pool-amount">{pool[player.id] ?? 0}</span>
					</td>
					<td class="num mountain">{mountain[player.id] ?? 0}</td>
					<td class="num">{whistBalance(player.id)}</td>
					<td class="num score" class:negative={(scores[player.id] ?? 0) < 0}>
						{scores[player.id] ?? 0}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.scoreboard {
		background: var(--surface-3);
		border: 1px solid var(--border-gold);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		color: var(--cream-200);
		min-width: 200px;
		box-shadow: var(--shadow-md);
	}

	.title {
		margin: 0 0 10px;
		font-size: var(--text-base);
		text-align: center;
		color: var(--highlight);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-base);
		font-variant-numeric: tabular-nums;
	}

	th {
		color: var(--gold-300);
		font-weight: normal;
		padding: 4px 8px;
		text-align: left;
		border-bottom: 1px solid var(--border-gold-soft);
	}

	tbody tr + tr td {
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	td {
		padding: 6px 8px;
		vertical-align: middle;
	}

	.num {
		text-align: right;
	}

	.pool {
		color: var(--highlight);
	}

	.pool-target {
		font-size: var(--text-xs);
		color: var(--cream-500);
		font-weight: normal;
	}

	.pool-amount {
		font-size: var(--text-lg);
		font-weight: bold;
		color: var(--highlight);
	}

	.mountain {
		color: var(--warning);
	}

	.score {
		font-weight: bold;
		font-size: var(--text-md);
		text-align: right;
		color: var(--success);
	}

	.score.negative {
		color: var(--danger);
	}

	.avatar {
		border-radius: 50%;
		vertical-align: middle;
		margin-right: 6px;
	}
</style>
