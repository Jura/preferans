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
				<th title={$t('app.scoreboard.poolHint', { bulletTarget })}>{$t('app.scoreboard.pool')}</th>
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
					<td class="num pool">{pool[player.id] ?? 0}/{bulletTarget}</td>
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
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid #c8a96e;
		border-radius: 8px;
		padding: 12px 16px;
		color: #f0e6d3;
		min-width: 200px;
	}

	.title {
		margin: 0 0 10px;
		font-size: 14px;
		text-align: center;
		color: #ffd700;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}

	th {
		color: #c8a96e;
		font-weight: normal;
		padding: 4px 8px;
		text-align: left;
		border-bottom: 1px solid rgba(200, 169, 110, 0.3);
	}

	td {
		padding: 6px 8px;
		vertical-align: middle;
	}

	.num {
		text-align: right;
	}

	.pool {
		color: #ffd700;
	}

	.mountain {
		color: #ff9d76;
	}

	.score {
		font-weight: bold;
		font-size: 16px;
		text-align: right;
		color: #7eff8a;
	}

	.score.negative {
		color: #ff6b6b;
	}

	.avatar {
		border-radius: 50%;
		vertical-align: middle;
		margin-right: 6px;
	}
</style>
