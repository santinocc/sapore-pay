/**
 * ChefOnboarding.tsx — the one trust moment.
 *
 * Becoming a Chef is where Sapore starts letting someone take money from
 * strangers and receive USDC payouts. That is the event worth a uniqueness
 * proof. Browsing and buying recipes are not: a Cooker spending $1.23 has no
 * trust event that needs one, and gating them would be exactly the
 * over-application World's card penalises.
 *
 * Proof of Human is the minimum sufficient credential. We need to know this is
 * a distinct person, not who they are — Passport/NFC would collect nationality
 * and identity the decision does not use.
 *
 * Every outcome below is a designed screen. The rejection path is not an error
 * toast bolted onto a happy path; it is half the point.
 */

import { useState } from 'react'
import {
  CHEF_ONBOARDING_ACTION,
  type HumanVerifier,
  type VerificationOutcome,
} from '../lib/humanVerifier'
import './chef-onboarding.css'

type Phase =
  | { kind: 'intro' }
  | { kind: 'verifying' }
  | { kind: 'done'; outcome: VerificationOutcome }

export function ChefOnboarding({
  verifier,
  accountId,
  onVerified,
  onClaimEns,
}: {
  verifier: HumanVerifier
  accountId: string
  onVerified?: (nullifierHash: string) => void
  /** "Claim your name.sapore.eth" — an explicit next step, not an auto-redirect. */
  onClaimEns?: () => void
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' })

  async function run() {
    setPhase({ kind: 'verifying' })
    // The signal binds the proof to this account, so a proof captured for one
    // account cannot be replayed to verify another.
    const outcome = await verifier.verify(CHEF_ONBOARDING_ACTION, accountId)
    setPhase({ kind: 'done', outcome })
    if (outcome.status === 'verified') onVerified?.(outcome.nullifierHash)
  }

  if (phase.kind === 'intro') return <Intro onStart={run} />
  if (phase.kind === 'verifying') return <Verifying />
  return (
    <Outcome
      outcome={phase.outcome}
      onRetry={() => setPhase({ kind: 'intro' })}
      onClaimEns={onClaimEns}
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
  return <section className={`co-card co-card--${tone}`}>{children}</section>
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <Card>
      <p className="co-eyebrow">Become a Chef</p>
      <h1 className="co-title">One human, one Chef account</h1>
      <p className="co-lede">
        Chefs take payments from strangers and receive USDC payouts. Before we
        open that up, we check that you are a unique person — once.
      </p>

      <ul className="co-list">
        <li>
          <span className="co-tick" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>We learn that you are one human.</strong> Nothing else.
          </div>
        </li>
        <li>
          <span className="co-tick" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>We never see your name, country or age.</strong> Proof of
            Human proves uniqueness, and uniqueness is all this decision needs.
          </div>
        </li>
        <li>
          <span className="co-tick" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>We store one anonymous value.</strong> A nullifier hash
            scoped to this action — never the proof itself.
          </div>
        </li>
      </ul>

      <button
        type="button"
        className="co-btn co-btn--primary"
        onClick={onStart}
      >
        Verify with World ID
      </button>
      <p className="co-footnote">
        Buying recipes never requires this. Only becoming a Chef does.
      </p>
    </Card>
  )
}

function Verifying() {
  return (
    <Card>
      <div className="co-spinner" role="status" aria-live="polite">
        <span className="co-spinner__ring" aria-hidden="true" />
        <span className="co-sr">Waiting for World ID…</span>
      </div>
      <h1 className="co-title">Waiting for World ID</h1>
      <p className="co-lede">
        Finish the check in the World App window. You can cancel at any point —
        nothing is saved until it succeeds.
      </p>
    </Card>
  )
}

function Outcome({
  outcome,
  onRetry,
  onClaimEns,
}: {
  outcome: VerificationOutcome
  onRetry: () => void
  onClaimEns?: () => void
}) {
  switch (outcome.status) {
    case 'verified':
      return (
        <Card tone="ok">
          <p className="co-eyebrow co-eyebrow--ok">Verified</p>
          <h1 className="co-title">You&rsquo;re a Chef</h1>
          <p className="co-lede">
            Next, claim your name on ENS — it becomes the address your payouts
            resolve to, and the one Cookers see.
          </p>
          <p
            className="co-mono"
            title="Stored scoped to chef-onboarding. The proof itself is discarded."
          >
            nullifier · {shorten(outcome.nullifierHash)}
          </p>
          <button
            type="button"
            className="co-btn co-btn--primary"
            onClick={onClaimEns}
          >
            Claim your name.sapore.eth
          </button>
        </Card>
      )

    case 'already_registered':
      return (
        <Card tone="warn">
          <p className="co-eyebrow co-eyebrow--warn">Already a Chef</p>
          <h1 className="co-title">This human already has a Chef account</h1>
          <p className="co-lede">
            Your World ID is already linked to
            {outcome.existingChefAlias ? (
              <>
                {' '}
                <strong>{outcome.existingChefAlias}.sapore.eth</strong>
              </>
            ) : (
              <> another Chef account</>
            )}
            . One person can hold one Chef account — that&rsquo;s what keeps
            referral rewards and sales honest for everyone.
          </p>
          <div className="co-actions">
            <button type="button" className="co-btn co-btn--primary">
              Sign in to that account
            </button>
            <button type="button" className="co-btn co-btn--ghost">
              Keep cooking instead
            </button>
          </div>
          <p className="co-footnote">
            Wrong account? Contact support — we can move a Chef profile, but we
            can&rsquo;t give one human two.
          </p>
        </Card>
      )

    case 'cancelled':
      return (
        <Card>
          <p className="co-eyebrow">Cancelled</p>
          <h1 className="co-title">No problem — nothing was saved</h1>
          <p className="co-lede">
            You closed the World ID check, so we didn&rsquo;t record anything.
            You can keep browsing and buying recipes exactly as before.
          </p>
          <div className="co-actions">
            <button
              type="button"
              className="co-btn co-btn--primary"
              onClick={onRetry}
            >
              Try again
            </button>
            <button type="button" className="co-btn co-btn--ghost">
              Back to recipes
            </button>
          </div>
        </Card>
      )

    case 'unavailable':
      return (
        <Card tone="warn">
          <p className="co-eyebrow co-eyebrow--warn">Can&rsquo;t verify yet</p>
          <h1 className="co-title">No World ID on this device</h1>
          <p className="co-lede">{outcome.reason}</p>
          <p className="co-lede">
            Proof of Human needs the World App. Your account is untouched and
            you can come back to this at any time.
          </p>
          <div className="co-actions">
            <a
              className="co-btn co-btn--primary"
              href="https://world.org/world-app"
              target="_blank"
              rel="noreferrer noopener"
            >
              Get World App
            </a>
            <button
              type="button"
              className="co-btn co-btn--ghost"
              onClick={onRetry}
            >
              I have it now
            </button>
          </div>
        </Card>
      )

    case 'error':
      return (
        <Card tone="danger">
          <p className="co-eyebrow co-eyebrow--danger">Something went wrong</p>
          <h1 className="co-title">We couldn&rsquo;t finish the check</h1>
          <p className="co-lede">{outcome.message}</p>
          <p className="co-lede">
            Nothing was saved and nothing was charged. Trying again is safe.
          </p>
          <button
            type="button"
            className="co-btn co-btn--primary"
            onClick={onRetry}
          >
            Try again
          </button>
        </Card>
      )
  }
}

function shorten(hash: string) {
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash
}
