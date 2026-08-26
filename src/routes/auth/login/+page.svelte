<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | null } = $props();
</script>

<svelte:head>
	<title>{$t('app.login.title')}</title>
</svelte:head>

<div class="login-page">
	<div class="login-card">
		<h1>{$t('app.login.heading')}</h1>
		<p>{$t('app.login.subtitle')}</p>
		<p class="invite-note">{$t('app.login.inviteNote')}</p>

		<a href="/auth/start" class="btn-google">
			<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
				<path
					fill="#4285F4"
					d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
				/>
				<path
					fill="#34A853"
					d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
				/>
				<path
					fill="#FBBC05"
					d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
				/>
				<path
					fill="#EA4335"
					d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
				/>
			</svg>
			{$t('app.login.google')}
		</a>

		{#if data.dummyLoginEnabled}
			<div class="divider">
				<span>{$t('app.login.dummy.or')}</span>
			</div>

			<form method="POST" action="?/dummyLogin" use:enhance class="dummy-form">
				<label class="dummy-label" for="dummy-access-code">{$t('app.login.dummy.codeLabel')}</label>
				<input
					id="dummy-access-code"
					name="accessCode"
					type="password"
					required
					autocomplete="current-password"
					placeholder={$t('app.login.dummy.codePlaceholder')}
				/>

				<div class="dummy-buttons">
					{#each data.dummyAccounts as account}
						<button type="submit" class="btn-dummy" name="dummyId" value={account.id}>
							{$t('app.login.dummy.signInAs', { values: { name: account.name } })}
						</button>
					{/each}
				</div>
			</form>

			{#if form?.dummyLoginError}
				<p class="dummy-error">{form.dummyLoginError}</p>
			{/if}

			<p class="dummy-note">{$t('app.login.dummy.note')}</p>
		{/if}
	</div>
</div>

<style>
	.login-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
	}

	.login-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(200, 169, 110, 0.3);
		border-radius: 16px;
		padding: 48px 40px;
		text-align: center;
		max-width: 360px;
		width: 100%;
	}

	h1 {
		font-size: 28px;
		margin: 0 0 12px;
		color: #ffd700;
	}

	p {
		color: #c0b090;
		margin: 0 0 16px;
		font-size: 15px;
		line-height: 1.5;
	}

	.invite-note {
		color: #a09060;
		margin: 0 0 32px;
		font-size: 13px;
		line-height: 1.5;
	}

	.btn-google {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		background: #fff;
		color: #1a1a2e;
		padding: 12px 24px;
		border-radius: 8px;
		font-size: 15px;
		font-family: inherit;
		font-weight: 500;
		text-decoration: none;
		transition:
			box-shadow 0.15s,
			transform 0.15s;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.btn-google:hover {
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		transform: translateY(-1px);
		text-decoration: none;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 24px 0 16px;
		color: #a09060;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: rgba(200, 169, 110, 0.2);
	}

	.dummy-form {
		display: grid;
		gap: 12px;
		text-align: left;
	}

	.dummy-label,
	.dummy-note,
	.dummy-error {
		font-size: 13px;
	}

	.dummy-label {
		color: #c0b090;
	}

	.dummy-form input {
		width: 100%;
		box-sizing: border-box;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(200, 169, 110, 0.35);
		border-radius: 8px;
		color: #f0e6d3;
		padding: 10px 12px;
		font: inherit;
	}

	.dummy-buttons {
		display: grid;
		gap: 10px;
	}

	.btn-dummy {
		border: 1px solid rgba(200, 169, 110, 0.45);
		background: rgba(255, 255, 255, 0.08);
		color: #f0e6d3;
		padding: 10px 14px;
		border-radius: 8px;
		font: inherit;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-dummy:hover {
		background: rgba(255, 255, 255, 0.14);
	}

	.dummy-error {
		color: #ffb3b3;
		margin: 12px 0 0;
	}

	.dummy-note {
		color: #a09060;
		margin: 12px 0 0;
	}
</style>
