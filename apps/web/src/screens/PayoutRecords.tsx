/**
 * PayoutRecords.tsx — setting a Chef's payout address once their name is
 * claimed.
 *
 * Writes addr(60) and addr(ENSIP-11 Tempo) in one resolver multicall (see
 * ensRecords.ts). The two failure states that aren't generic errors —
 * `no_resolver` and `unauthorized` — are named for real conditions the
 * ENSv2 guide documents, not made up for this screen: a subname without its
 * own resolver yet, and Enhanced Access Control rejecting a write from an
 * account that holds no roles on the resolver it's targeting.
 */

import { useEffect, useRef, useState } from 'react'
import type { RecordWriter } from '../lib/recordWriter'
import './ens-claim.css'

type Phase =
  | { kind: 'input'; address: string; error?: string }
  | { kind: 'writing' }
  | { kind: 'written'; txHash: string }
  | { kind: 'no_resolver' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

export function PayoutRecords({
  writer,
  fullName,
  defaultAddress = '',
  claimTxHash,
  autoSubmit = false,
}: {
  writer: RecordWriter
  fullName: string
  defaultAddress?: string
  /** The claim's own tx hash, when the caller already has it — shown
   * alongside the payout tx once written, so skipping the claim step's own
   * confirmation screen (see EnsClaim's autoAdvance) doesn't lose the
   * proof, just consolidates it onto the one screen that's left. */
  claimTxHash?: string
  /** Fire the write the moment the address is locked in, no button click.
   * Only meaningful together with a locked (real) address — Simulated mode
   * ignores this, since typing an address there is the point. */
  autoSubmit?: boolean
}) {
  // A connected wallet's address is fixed, not a suggestion: it's the same
  // wallet that signed the claim, and payouts going anywhere else defeats
  // the point of tying the ENS name to that wallet in the first place. Only
  // Simulated mode (no defaultAddress — no real wallet to fix it to) leaves
  // this typeable, for exercising the demo scenarios freely.
  const locked = defaultAddress !== ''
  const [phase, setPhase] = useState<Phase>({
    kind: 'input',
    address: defaultAddress,
  })

  async function submit(address: string) {
    if (!ADDRESS_PATTERN.test(address)) {
      setPhase({
        kind: 'input',
        address,
        error: 'Enter a valid 0x… address (42 characters).',
      })
      return
    }
    setPhase({ kind: 'writing' })
    try {
      const outcome = await writer.write(fullName, {
        payoutAddress: address as `0x${string}`,
      })
      if (outcome.status === 'written') {
        setPhase({ kind: 'written', txHash: outcome.txHash })
      } else if (outcome.status === 'error') {
        setPhase({ kind: 'error', message: outcome.message })
      } else {
        setPhase({ kind: outcome.status })
      }
    } catch (err) {
      setPhase({ kind: 'error', message: (err as Error).message })
    }
  }

  // Fires once, and only for the locked (real) address — a failed attempt
  // falls back to the manual button below rather than retrying on its own,
  // since silently resubmitting a failed on-chain write isn't something to
  // do without the Chef noticing.
  const autoSubmittedRef = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires once per mount by design (autoSubmittedRef guards it); defaultAddress/phase.kind/submit are fixed for this mount's lifetime once locked is true.
  useEffect(() => {
    if (
      !autoSubmit ||
      !locked ||
      phase.kind !== 'input' ||
      autoSubmittedRef.current
    ) {
      return
    }
    autoSubmittedRef.current = true
    submit(defaultAddress)
  }, [autoSubmit, locked])

  if (phase.kind === 'input') {
    return (
      <InputForm
        fullName={fullName}
        address={phase.address}
        locked={locked}
        error={phase.error}
        onSubmit={submit}
      />
    )
  }
  if (phase.kind === 'writing') return <Writing />
  if (phase.kind === 'written') {
    return <Written txHash={phase.txHash} claimTxHash={claimTxHash} />
  }
  if (phase.kind === 'no_resolver') {
    return <NoResolver fullName={fullName} />
  }
  if (phase.kind === 'unauthorized') return <Unauthorized />
  return (
    <ErrorState
      message={phase.message}
      onRetry={() => setPhase({ kind: 'input', address: defaultAddress })}
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

function InputForm({
  fullName,
  address,
  locked,
  error,
  onSubmit,
}: {
  fullName: string
  address: string
  locked: boolean
  error?: string
  onSubmit: (address: string) => void
}) {
  const [value, setValue] = useState(address)
  return (
    <Card>
      <p className="ec-eyebrow">Payout address</p>
      <h1 className="ec-title">
        {locked
          ? `You'll get paid to your ${fullName} wallet`
          : `Where should ${fullName} get paid?`}
      </h1>
      <p className="ec-lede">
        Written to <span className="ec-mono-inline">addr(60)</span> and to the
        Tempo-specific record (ENSIP-11) in one transaction, so both resolve to
        the same wallet from the moment either is read.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(value)
        }}
      >
        {locked ? (
          <p className="ec-mono-inline" title={value}>
            {shorten(value)}
          </p>
        ) : (
          <input
            className="ec-input ec-input--wide"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0x…"
            aria-label="Payout address"
          />
        )}
        {error && <p className="ec-error">{error}</p>}
        <button type="submit" className="ec-btn ec-btn--primary">
          Set payout address
        </button>
      </form>
    </Card>
  )
}

function Writing() {
  return (
    <Card>
      <div className="ec-spinner" role="status" aria-live="polite">
        <span className="ec-spinner__ring" aria-hidden="true" />
      </div>
      <h1 className="ec-title">Writing records…</h1>
      <p className="ec-lede">Confirming on Sepolia. This can take a moment.</p>
    </Card>
  )
}

function Written({
  txHash,
  claimTxHash,
}: {
  txHash: string
  claimTxHash?: string
}) {
  return (
    <Card tone="ok">
      <p className="ec-eyebrow ec-eyebrow--ok">Done</p>
      <h1 className="ec-title">Payout address set</h1>
      <p className="ec-lede">
        The next payout batch resolves your share through this record, not a
        stored database field.
      </p>
      {claimTxHash && (
        <p className="ec-lede">
          Name claim:{' '}
          <span className="ec-mono-inline">{shortenTx(claimTxHash)}</span>
          {' · '}
          Payout: <span className="ec-mono-inline">{shortenTx(txHash)}</span>
        </p>
      )}
      {!claimTxHash && <p className="ec-mono">{shortenTx(txHash)}</p>}
    </Card>
  )
}

function shortenTx(hash: string) {
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash
}

function NoResolver({ fullName }: { fullName: string }) {
  return (
    <Card tone="warn">
      <p className="ec-eyebrow ec-eyebrow--warn">Not ready yet</p>
      <h1 className="ec-title">{fullName} has no resolver yet</h1>
      <p className="ec-lede">
        Your name is claimed, but nothing is set up to hold records on it yet.
        This resolves itself as part of claiming — if you&rsquo;re seeing this,
        something in that step didn&rsquo;t finish. Try claiming again, or
        contact support if it persists.
      </p>
    </Card>
  )
}

function Unauthorized() {
  return (
    <Card tone="danger">
      <p className="ec-eyebrow ec-eyebrow--danger">Not authorized</p>
      <h1 className="ec-title">This wallet can&rsquo;t write to that name</h1>
      <p className="ec-lede">
        The connected wallet holds no roles on this name&rsquo;s resolver. This
        usually means you&rsquo;re signed in with a different wallet than the
        one that claimed the name — reconnect with that wallet and try again.
      </p>
    </Card>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Card tone="danger">
      <p className="ec-eyebrow ec-eyebrow--danger">Something went wrong</p>
      <h1 className="ec-title">Couldn&rsquo;t write the record</h1>
      <p className="ec-lede">{message}</p>
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

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
