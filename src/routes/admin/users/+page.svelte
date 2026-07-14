<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | null } = $props();
</script>

<svelte:head>
	<title>{$t('app.admin.title')}</title>
</svelte:head>

<div class="admin-page">
	<section class="admin-card">
		<h1>{$t('app.admin.heading')}</h1>
		<p>{$t('app.admin.subtitle')}</p>
		{#if data.adminEmail}
			<p class="admin-meta">
				<strong>{$t('app.admin.adminEmailLabel')}</strong>
				{data.adminEmail}
			</p>
		{/if}

		<form method="POST" action="?/addUser" use:enhance class="add-form">
			<label for="email">{$t('app.admin.emailLabel')}</label>
			<div class="add-row">
				<input
					id="email"
					name="email"
					type="email"
					required
					placeholder={$t('app.admin.emailPlaceholder')}
				/>
				<button type="submit" class="btn-primary">{$t('app.admin.addUser')}</button>
			</div>
		</form>

		{#if form?.message}
			<p class="form-message">{form.message}</p>
		{/if}
	</section>

	<section class="admin-card">
		<h2>{$t('app.admin.allowedUsers')}</h2>

		{#if data.allowedUsers.length === 0}
			<p class="empty-state">{$t('app.admin.empty')}</p>
		{:else}
			<ul class="user-list">
				{#each data.allowedUsers as user}
					<li class="user-row">
						<div class="user-details">
							<div class="user-email">{user.email}</div>
							{#if user.name}
								<div class="user-name">{user.name}</div>
							{/if}
						</div>
						<form method="POST" action="?/removeUser" use:enhance>
							<input type="hidden" name="email" value={user.email} />
							<button type="submit" class="btn-outline danger">
								{$t('app.admin.removeUser')}
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.admin-page {
		max-width: 840px;
		margin: 0 auto;
		display: grid;
		gap: 24px;
	}

	.admin-card {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(200, 169, 110, 0.2);
		border-radius: 12px;
		padding: 24px;
	}

	h1,
	h2 {
		margin: 0 0 12px;
		color: #ffd700;
	}

	.admin-meta,
	.empty-state,
	.user-name {
		color: #c0b090;
	}

	.add-form {
		display: grid;
		gap: 8px;
		margin-top: 16px;
	}

	.add-row {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	input {
		flex: 1;
		min-width: 260px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(200, 169, 110, 0.35);
		border-radius: 6px;
		color: #f0e6d3;
		padding: 10px 12px;
	}

	.form-message {
		margin: 12px 0 0;
		color: #c8a96e;
	}

	.user-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 12px;
	}

	.user-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(200, 169, 110, 0.15);
		border-radius: 8px;
		padding: 14px 16px;
	}

	.user-email {
		font-weight: 600;
	}

	.btn-primary,
	.btn-outline {
		padding: 10px 16px;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-primary {
		border: none;
		background: #c8a96e;
		color: #1a1a2e;
	}

	.btn-outline {
		background: transparent;
		color: #c8a96e;
		border: 1px solid #c8a96e;
	}

	.danger {
		color: #ffb3b3;
		border-color: rgba(255, 179, 179, 0.8);
	}
</style>
