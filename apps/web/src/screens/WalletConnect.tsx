/**
 * WalletConnect.tsx — getting the Chef a real wallet before they claim a
 * name or set payout records, so both use their own address instead of a
 * hardcoded demo one.
 *
 * Same "every outcome is a designed screen, transitions are explicit
 * buttons" pattern as ChefOnboarding.tsx and EnsClaim.tsx — including not
 * auto-advancing once the wallet is ready, for the same reason EnsClaim's
 * "Claimed" screen doesn't: this is the one screen that proves a real
 * wallet exists before anything gets signed with it.
 */

import { useCreateWallet, usePrivy } from '@privy-io/react-auth'
import { type ChefWalletState, useChefWallet } from '../lib/privyWallet'
import './wallet-connect.css'

type ReadyChefWallet = Extract<ChefWalletState, { status: 'ready' }>

export function WalletConnect({
  onReady,
}: {
  onReady: (wallet: ReadyChefWallet) => void
}) {
  const { login, logout } = usePrivy()
  const { createWallet } = useCreateWallet()
  const state = useChefWallet()

  if (state.status === 'loading') return <Working />
  if (state.status === 'logged_out') return <Intro onLogin={() => login()} />
  if (state.status === 'no_embedded_wallet') {
    return <NeedsWallet onCreate={() => createWallet()} onLogout={logout} />
  }
  if (state.status === 'error') {
    return <Failed state={state} onRetry={logout} />
  }
  return (
    <Ready
      address={state.address}
      onContinue={() => onReady(state)}
      onLogout={logout}
    />
  )
}

function Card({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'danger'
  children: React.ReactNode
}) {
  return <section className={`wc-card wc-card--${tone}`}>{children}</section>
}

function Working() {
  return (
    <Card>
      <div className="wc-spinner" role="status" aria-live="polite">
        <span className="wc-spinner__ring" aria-hidden="true" />
      </div>
      <h1 className="wc-title">Setting up your wallet</h1>
      <p className="wc-lede">One moment.</p>
    </Card>
  )
}

function Intro({ onLogin }: { onLogin: () => void }) {
  return (
    <Card>
      <p className="wc-eyebrow">Almost there</p>
      <h1 className="wc-title">Get your wallet</h1>
      <p className="wc-lede">
        Claiming <strong>alias.sapore.eth</strong> and setting your payout
        address both need a wallet to sign with. Log in once with your email and
        Privy creates one for you automatically — no seed phrase to write down,
        no extension to install.
      </p>
      <button
        type="button"
        className="wc-btn wc-btn--primary"
        onClick={onLogin}
      >
        Continue with email
      </button>
      <p className="wc-footnote">
        This wallet is yours. Sapore never holds its key.
      </p>
    </Card>
  )
}

function NeedsWallet({
  onCreate,
  onLogout,
}: {
  onCreate: () => void
  onLogout: () => void
}) {
  return (
    <Card tone="warn">
      <p className="wc-eyebrow wc-eyebrow--warn">One more step</p>
      <h1 className="wc-title">Create your wallet</h1>
      <p className="wc-lede">
        You're logged in, but no wallet was created for this account yet.
      </p>
      <div className="wc-actions">
        <button
          type="button"
          className="wc-btn wc-btn--primary"
          onClick={onCreate}
        >
          Create wallet
        </button>
        <button
          type="button"
          className="wc-btn wc-btn--ghost"
          onClick={onLogout}
        >
          Log in differently
        </button>
      </div>
    </Card>
  )
}

function Ready({
  address,
  onContinue,
  onLogout,
}: {
  address: `0x${string}`
  onContinue: () => void
  onLogout: () => void
}) {
  return (
    <Card tone="ok">
      <p className="wc-eyebrow wc-eyebrow--ok">Wallet ready</p>
      <h1 className="wc-title">You're signed in</h1>
      <p className="wc-lede">
        This is the address your ENS name and payout records will use.
      </p>
      <p className="wc-mono">{shorten(address)}</p>
      <button
        type="button"
        className="wc-btn wc-btn--primary"
        onClick={onContinue}
      >
        Continue to claim your name →
      </button>
      <button type="button" className="wc-btn wc-btn--ghost" onClick={onLogout}>
        Use a different account
      </button>
    </Card>
  )
}

function Failed({
  state,
  onRetry,
}: {
  state: Extract<ChefWalletState, { status: 'error' }>
  onRetry: () => void
}) {
  return (
    <Card tone="danger">
      <p className="wc-eyebrow wc-eyebrow--danger">Something went wrong</p>
      <h1 className="wc-title">We couldn't set up your wallet</h1>
      <p className="wc-lede">{state.message}</p>
      <button
        type="button"
        className="wc-btn wc-btn--primary"
        onClick={onRetry}
      >
        Try again
      </button>
    </Card>
  )
}

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
