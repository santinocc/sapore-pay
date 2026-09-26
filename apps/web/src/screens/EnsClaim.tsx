/**
 * EnsClaim.tsx — claiming `<alias>.sapore.eth` and setting payout records.
 *
 * Two steps in one flow, because they answer two different questions:
 *
 *   1. Claim the name        — creates the subname, makes it the Chef's
 *   2. Set payout records    — writes addr(60) / addr(Tempo) / tier / verified
 *
 * ENSv2's own guide draws this line for a reason: registration and record
 * writing are genuinely separate transactions ("A name your user just
 * registered resolves to null — no address record set yet"), and that's
 * reflected here rather than papered over — a claimed-but-unconfigured name
 * is a real, valid, demoable state, not a bug to hide.
 */

import { useEffect, useState } from 'react'
import {
  type ClaimOutcome,
  type SubnameClaimer,
  validateAlias,
} from '../lib/ensClaim'
import type { WriteRecordsOutcome } from '../lib/ensRecords'
import './ens-claim.css'

// Long enough to read the confirmation and tx hash before moving on.
const AUTO_ADVANCE_MS = 900

type ClaimPhase =
  | { kind: 'intro'; alias: string; error?: string }
  | { kind: 'checking'; alias: string }
  | { kind: 'claiming'; alias: string }
  | { kind: 'claimed'; outcome: Extract<ClaimOutcome, { status: 'claimed' }> }
  | { kind: 'failed'; outcome: Exclude<ClaimOutcome, { status: 'claimed' }> }

export function EnsClaim({
  claimer,
  ownerAddress,
  autoAdvance = false,
  onClaimed,
}: {
  claimer: SubnameClaimer
  ownerAddress: `0x${string}`
  /** Skip the "Claimed — click to continue" pause and move to payout
   * records on its own. Only meaningful when the caller is about to chain
   * straight into an automatic payout write (both steps in Real mode) —
   * there's no decision this pause was protecting there, just proof the
   * claim happened, which the tx hash below still shows either way. */
  autoAdvance?: boolean
  onClaimed?: (fullName: string, txHash: string) => void
}) {
  const [phase, setPhase] = useState<ClaimPhase>({ kind: 'intro', alias: '' })

  async function submit(alias: string) {
    const check = validateAlias(alias)
    if (!check.valid) {
      setPhase({ kind: 'intro', alias, error: check.reason })
      return
    }
    setPhase({ kind: 'checking', alias })
    // Wrapped end to end: isAvailable() has no error channel of its own
    // (it returns a plain boolean), so a network failure — e.g.
    // apps/service isn't running — would otherwise throw uncaught here and
    // leave the UI stuck on "Checking availability" forever, with no
    // setPhase call left to run.
    try {
      const available = await claimer.isAvailable(alias)
      if (!available) {
        setPhase({
          kind: 'failed',
          outcome: { status: 'taken', fullName: `${alias}.sapore.eth` },
        })
        return
      }
      setPhase({ kind: 'claiming', alias })
      const outcome = await claimer.claim(alias, ownerAddress)
      if (outcome.status === 'claimed') {
        // Show the confirmation — don't advance yet. Auto-advancing here
        // would skip past the one screen that proves the claim actually
        // happened (the tx hash), same reasoning as the World onboarding
        // screen's explicit "Claim your name" button instead of an
        // auto-redirect.
        setPhase({ kind: 'claimed', outcome })
      } else {
        setPhase({ kind: 'failed', outcome })
      }
    } catch (err) {
      setPhase({
        kind: 'failed',
        outcome: { status: 'error', message: (err as Error).message },
      })
    }
  }

  if (phase.kind === 'intro') {
    return (
      <IntroForm alias={phase.alias} error={phase.error} onSubmit={submit} />
    )
  }
  if (phase.kind === 'checking' || phase.kind === 'claiming') {
    return <Working alias={phase.alias} kind={phase.kind} />
  }
  if (phase.kind === 'claimed') {
    return (
      <Claimed
        outcome={phase.outcome}
        autoAdvance={autoAdvance}
        onContinue={() =>
          onClaimed?.(phase.outcome.fullName, phase.outcome.txHash)
        }
      />
    )
  }
  return (
    <Failed
      outcome={phase.outcome}
      onRetry={() => setPhase({ kind: 'intro', alias: '' })}
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
  return <section className={`ec-card ec-card--${tone}`}>{children}</section>
}

function IntroForm({
  alias,
  error,
  onSubmit,
}: {
  alias: string
  error?: string
  onSubmit: (alias: string) => void
}) {
  const [value, setValue] = useState(alias)
  return (
    <Card>
      <p className="ec-eyebrow">Claim your name</p>
      <h1 className="ec-title">Pick your name on ENS</h1>
      <p className="ec-lede">
        <strong>
          {value ? `${value.toLowerCase()}.sapore.eth` : 'yourname.sapore.eth'}
        </strong>{' '}
        becomes where your payouts resolve to, and the name Cookers see on your
        recipes.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(value)
        }}
      >
        <div className="ec-input-row">
          <input
            className="ec-input"
            value={value}
            onChange={(e) => setValue(e.target.value.toLowerCase())}
            placeholder="yourname"
            aria-label="Chef alias"
          />
          <span className="ec-suffix">.sapore.eth</span>
        </div>
        {error && <p className="ec-error">{error}</p>}
        <button type="submit" className="ec-btn ec-btn--primary">
          Check &amp; claim
        </button>
      </form>
      <p className="ec-footnote">
        You keep full control of your profile text and payout address. Sapore
        can revoke a name on fraud, but can never edit what you set.
      </p>
    </Card>
  )
}

function Working({
  alias,
  kind,
}: {
  alias: string
  kind: 'checking' | 'claiming'
}) {
  return (
    <Card>
      <div className="ec-spinner" role="status" aria-live="polite">
        <span className="ec-spinner__ring" aria-hidden="true" />
      </div>
      <h1 className="ec-title">
        {kind === 'checking' ? 'Checking availability…' : 'Claiming your name…'}
      </h1>
      <p className="ec-lede">
        {kind === 'checking'
          ? `Looking up ${alias}.sapore.eth on Sepolia.`
          : 'Submitting the registration. This can take a moment to confirm on-chain.'}
      </p>
    </Card>
  )
}

function Claimed({
  outcome,
  autoAdvance,
  onContinue,
}: {
  outcome: Extract<ClaimOutcome, { status: 'claimed' }>
  autoAdvance: boolean
  onContinue?: () => void
}) {
  // A ref-guarded "fire once" breaks under StrictMode's dev-only double
  // effect invocation (mount -> cleanup -> mount again): the ref flips to
  // true before the first timer's cleanup cancels it, so the second
  // invocation sees it already set and never schedules a replacement —
  // onContinue never actually fires. A closure-local `cancelled` avoids
  // that: each invocation only cancels its own timer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fires once per real mount when autoAdvance is true; onContinue is a fresh closure each render, not something this timer should re-arm against.
  useEffect(() => {
    if (!autoAdvance || !onContinue) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (!cancelled) onContinue()
    }, AUTO_ADVANCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [autoAdvance])

  return (
    <Card tone="ok">
      <p className="ec-eyebrow ec-eyebrow--ok">Claimed</p>
      <h1 className="ec-title">{outcome.fullName} is yours</h1>
      <p className="ec-lede">
        {autoAdvance
          ? 'Setting your payout address next, automatically — same wallet, no extra input needed.'
          : 'Next, set the address your payouts should land on. Until you do, the name resolves but has no payout record — Cookers can still find you, but the payout batch has nowhere to send your share yet.'}
      </p>
      <p className="ec-mono">{shortenTx(outcome.txHash)}</p>
      {!autoAdvance && (
        <button
          type="button"
          className="ec-btn ec-btn--primary"
          onClick={onContinue}
        >
          Set payout address →
        </button>
      )}
    </Card>
  )
}

function Failed({
  outcome,
  onRetry,
}: {
  outcome: Exclude<ClaimOutcome, { status: 'claimed' }>
  onRetry: () => void
}) {
  switch (outcome.status) {
    case 'taken':
      return (
        <Card tone="warn">
          <p className="ec-eyebrow ec-eyebrow--warn">Already claimed</p>
          <h1 className="ec-title">{outcome.fullName} is taken</h1>
          <p className="ec-lede">
            Someone already holds this name. Pick a different one — your Chef
            account is unaffected either way.
          </p>
          <button
            type="button"
            className="ec-btn ec-btn--primary"
            onClick={onRetry}
          >
            Try another name
          </button>
        </Card>
      )
    case 'invalid':
      return (
        <Card tone="warn">
          <p className="ec-eyebrow ec-eyebrow--warn">Not quite</p>
          <h1 className="ec-title">That name won&rsquo;t work</h1>
          <p className="ec-lede">{outcome.reason}</p>
          <button
            type="button"
            className="ec-btn ec-btn--primary"
            onClick={onRetry}
          >
            Try again
          </button>
        </Card>
      )
    case 'error':
      return (
        <Card tone="danger">
          <p className="ec-eyebrow ec-eyebrow--danger">Something went wrong</p>
          <h1 className="ec-title">We couldn&rsquo;t claim that name</h1>
          <p className="ec-lede">{outcome.message}</p>
          <p className="ec-lede">
            Nothing was charged and no name was reserved. Trying again is safe.
          </p>
          <button
            type="button"
            className="ec-btn ec-btn--primary"
            onClick={onRetry}
          >
            Try again
          </button>
        </Card>
      )
  }
}

function shortenTx(hash: string) {
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash
}

// Re-exported so a later payout-records step can reuse the outcome shape
// without importing ensRecords.ts twice in App.tsx.
export type { WriteRecordsOutcome }
