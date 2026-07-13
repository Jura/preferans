<script lang="ts">
	import type { Player } from '$lib/types/preferans';

	interface Props {
		scores: Record<string, number>;
		players: Player[];
		roundNumber: number;
	}

	let { scores, players, roundNumber }: Props = $props();
</script>

<div class="scoreboard" aria-label="Счёт">
	<h3 class="title">Счёт — раунд {roundNumber}</h3>
	<table>
		<thead>
			<tr>
				<th>Игрок</th>
				<th>Очки</th>
			</tr>
		</thead>
		<tbody>
			{#each players as player}
				<tr>
					<td>
						{#if player.avatarUrl}
							<img src={player.avatarUrl} alt={player.name} class="avatar" width="24" height="24" />
						{/if}
						{player.name}
					</td>
					<td class="score">{scores[player.id] ?? 0}</td>
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

	.score {
		font-weight: bold;
		font-size: 16px;
		text-align: right;
		color: #7eff8a;
	}

	.avatar {
		border-radius: 50%;
		vertical-align: middle;
		margin-right: 6px;
	}
</style>
