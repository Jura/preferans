<script lang="ts">
	import { t } from '$lib/i18n';
</script>

<svelte:head>
	<title>{$t('app.denied.title')}</title>
</svelte:head>

<div class="denied-page">
	<div class="denied-card">
		<h1>{$t('app.denied.heading')}</h1>
		<p>{$t('app.denied.message')}</p>
		<a href="/auth/login" class="btn-back">{$t('app.denied.backToLogin')}</a>
	</div>
</div>

<style>
	.denied-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
	}

	.denied-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(200, 100, 100, 0.35);
		border-radius: 16px;
		padding: 48px 40px;
		text-align: center;
		max-width: 400px;
		width: 100%;
	}

	h1 {
		font-size: 28px;
		margin: 0 0 16px;
		color: #ff6b6b;
	}

	p {
		color: #c0b090;
		margin: 0 0 32px;
		font-size: 15px;
		line-height: 1.5;
	}

	.btn-back {
		display: inline-block;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(200, 169, 110, 0.4);
		color: #f0e6d3;
		padding: 10px 24px;
		border-radius: 8px;
		font-size: 15px;
		font-weight: 500;
		text-decoration: none;
		transition: background 0.15s;
	}

	.btn-back:hover {
		background: rgba(255, 255, 255, 0.14);
		text-decoration: none;
	}
</style>
