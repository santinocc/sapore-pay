/**
 * WalletConnect.tsx — getting the Chef a real wallet before they claim a
 * name or set payout records, so both use their own address instead of a
 * hardcoded demo one.
 *
 * Same "every outcome is a designed screen, transitions are explicit
 * buttons" pattern as ChefOnboarding.tsx and EnsClaim.tsx for every state
 * except one: once the wallet is actually ready, there's no decision left
 * to make here — Privy already resolved who's signed in, and clicking
 * "Continue" was only ever relaying that fact upward, not confirming
 * anything new. So this state auto-advances (briefly showing the result
 * first, not a silent skip) while every other state — logged out, needs a
 * wallet, errored — still waits on an explicit action, same as before.
 */

import { useCreateWallet, usePrivy } from '@privy-io/react-auth'
import { useEffect } from 'react'
import { type ChefWalletState, useChefWallet } from '../lib/privyWallet'
import './wallet-connect.css'

type ReadyChefWallet = Extract<ChefWalletState, { status: 'ready' }>

// Long enough to read "Signed in as X" / the address, short enough that it
// doesn't feel like a stall — this isn't a checkpoint, just a beat.
const AUTO_CONTINUE_MS = 700

export function WalletConnect({
  onReady,
  chefName,
}: {
  onReady: (wallet: ReadyChefWallet) => void
  /** The Chef's already-claimed `<alias>.sapore.eth`, when one exists. Once
   * a name is claimed it's the identity that matters — the raw address
   * becomes a secondary detail, not the headline. Omit before a name is
   * claimed, since there's nothing yet to show instead of the address. */
  chefName?: string
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
      chefName={chefName}
      onReady={() => onReady(state)}
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
  chefName,
  onReady,
  onLogout,
}: {
  address: `0x${string}`
  chefName?: string
  onReady: () => void
  onLogout: () => void
}) {
  // Deliberately not a ref-guarded "fire once": under StrictMode's dev-only
  // double-invoke (mount -> cleanup -> mount again), a ref that flips to
  // true before the first timer's cleanup cancels it would block the
  // second invocation from ever scheduling a replacement — the timer never
  // actually fires. A plain closure-local `cancelled` avoids that: each
  // invocation owns and cancels only its own timer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fires once per real mount; onReady is a fresh setChefWallet-wrapping closure each render, not something this timer should re-arm against.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (!cancelled) onReady()
    }, AUTO_CONTINUE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return (
    <Card tone="ok">
      <p className="wc-eyebrow wc-eyebrow--ok">Wallet ready</p>
      <h1 className="wc-title">
        {chefName ? `Signed in as ${chefName}` : "You're signed in"}
      </h1>
      <p className="wc-lede">
        {chefName
          ? 'Payout records for this name use this wallet.'
          : 'This is the address your ENS name and payout records will use.'}
      </p>
      <p className="wc-mono" title={address}>
        {shorten(address)}
      </p>
      <p className="wc-footnote">Continuing automatically…</p>
      <button type="button" className="wc-btn wc-btn--ghost" onClick={onLogout}>
        Not you? Use a different account
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
