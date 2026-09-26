/**
 * worldVerifier.tsx — the real World ID verifier, behind humanVerifier.ts's
 * `HumanVerifier` interface.
 *
 * Rewritten for IDKit v4's real protocol (confirmed against the installed
 * package's own .d.ts files, not recalled from search results — see
 * docs/engineering-log.md for the v2.4.2 dead end this replaces). Two things
 * v2.4.2 didn't have:
 *
 *  1. Every v4 request needs a freshly-signed `rp_context` (short expiry, so
 *     it's fetched from apps/service once per attempt, not once at startup).
 *     `verify()` is async now for exactly this reason.
 *  2. `IDKitRequestWidget` is a controlled component (`open`/`onOpenChange`),
 *     not the old `useIDKit()` hook — so `open` is plain `useState` here, and
 *     `onOpenChange(false)` with no settled result is what "cancelled" means.
 *
 * The browser still never decides the outcome: `handleVerify` sends the full
 * v4 result to apps/service, which asks World; only a server-confirmed proof
 * reaches `onSuccess`. Throwing inside `handleVerify` is IDKit's documented
 * way to reject a proof and show the person an error instead of success.
 */

import type { IDKitResult, RpContext } from '@worldcoin/idkit'
import {
  IDKitErrorCodes,
  IDKitRequestWidget,
  proofOfHuman,
} from '@worldcoin/idkit'
import { useCallback, useRef, useState } from 'react'
import type { HumanVerifier, VerificationOutcome } from './humanVerifier'

export const WORLD_APP_ID = import.meta.env.VITE_WORLD_APP_ID ?? ''

/** What apps/service's POST /world/verify returns (see packages/world). */
type ServerVerification =
  | { status: 'verified'; nullifierHash: string }
  | { status: 'already_registered' }
  | { status: 'invalid'; code: string; detail: string }
  | { status: 'error'; message: string }

export function useWorldVerifier(opts: {
  serviceUrl: string
  action: string
  /** Bound into the proof, so it can't be replayed for another account. */
  signal: string
}): { verifier: HumanVerifier; widget: React.ReactNode } {
  const [open, setOpen] = useState(false)
  const [rpContext, setRpContext] = useState<RpContext | null>(null)
  const pending = useRef<((outcome: VerificationOutcome) => void) | null>(null)
  // handleVerify resolves the server round-trip; onSuccess is what actually
  // settles the outer promise. They're two different IDKit callbacks because
  // the nullifier only exists after the server round-trip inside handleVerify.
  const verifiedOutcome = useRef<VerificationOutcome | null>(null)

  const settle = useCallback((outcome: VerificationOutcome) => {
    const resolve = pending.current
    pending.current = null
    verifiedOutcome.current = null
    setOpen(false)
    setRpContext(null)
    resolve?.(outcome)
  }, [])

  async function verifyOnServer(
    result: IDKitResult,
  ): Promise<VerificationOutcome> {
    let res: Response
    try {
      res = await fetch(`${opts.serviceUrl}/world/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proof: result }),
      })
    } catch (err) {
      return { status: 'error', message: (err as Error).message }
    }
    if (!res.ok) {
      return { status: 'error', message: `Service returned ${res.status}` }
    }
    const body = (await res.json()) as ServerVerification
    switch (body.status) {
      case 'verified':
        return { status: 'verified', nullifierHash: body.nullifierHash }
      case 'already_registered':
        return { status: 'already_registered' }
      case 'invalid':
        return { status: 'error', message: body.detail }
      case 'error':
        return { status: 'error', message: body.message }
    }
  }

  const verifier: HumanVerifier = {
    async verify() {
      if (!WORLD_APP_ID) {
        return {
          status: 'error',
          message: 'World ID is not configured on this deployment.',
        }
      }
      let res: Response
      try {
        res = await fetch(`${opts.serviceUrl}/world/rp-context`)
      } catch (err) {
        return { status: 'error', message: (err as Error).message }
      }
      if (!res.ok) {
        return {
          status: 'error',
          message: `Could not start verification (service returned ${res.status}).`,
        }
      }
      const ctx = (await res.json()) as RpContext
      return new Promise<VerificationOutcome>((resolve) => {
        pending.current = resolve
        setRpContext(ctx)
        setOpen(true)
      })
    },
  }

  const widget =
    WORLD_APP_ID && rpContext ? (
      <IDKitRequestWidget
        app_id={WORLD_APP_ID as `app_${string}`}
        action={opts.action}
        rp_context={rpContext}
        // New app, no v3 nullifiers anywhere to reconcile — see
        // IDKitRequestConfig's own doc comment on this field.
        allow_legacy_proofs={false}
        preset={proofOfHuman({ signal: opts.signal })}
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next && pending.current) {
            settle({ status: 'cancelled' })
          }
        }}
        handleVerify={async (result) => {
          const outcome = await verifyOnServer(result)
          if (outcome.status !== 'verified') {
            // Settle first, then throw: the throw is what makes IDKit show
            // its own rejection screen instead of a success screen, but it
            // would otherwise leave our promise — and the screen awaiting
            // it — hanging.
            settle(outcome)
            throw new Error(rejectionMessage(outcome))
          }
          verifiedOutcome.current = outcome
        }}
        onSuccess={() => {
          settle(
            verifiedOutcome.current ?? {
              status: 'error',
              message: 'Verification succeeded without a server outcome.',
            },
          )
        }}
        onError={(errorCode) => {
          settle(mapIdKitError(errorCode))
        }}
      />
    ) : null

  return { verifier, widget }
}

/**
 * What IDKit shows inside its own modal when the server rejects a proof.
 * Exhaustive over the non-verified outcomes so a new one can't silently
 * fall through to a blank message.
 */
function rejectionMessage(
  outcome: Exclude<VerificationOutcome, { status: 'verified' }>,
): string {
  switch (outcome.status) {
    case 'already_registered':
      return 'This human already has a Chef account.'
    case 'cancelled':
      return 'Verification was cancelled.'
    case 'unavailable':
      return outcome.reason
    case 'error':
      return outcome.message
  }
}

/**
 * IDKit v4's error codes onto outcomes the product already has screens for.
 * `max_verifications_reached` is the interesting one: it is World enforcing
 * one-proof-per-human-per-action, which is exactly the "already a Chef" case,
 * not a failure. `cancelled` mirrors `onOpenChange`'s own detection — kept as
 * a second path in case IDKit fires both for the same dismissal.
 */
function mapIdKitError(code: IDKitErrorCodes): VerificationOutcome {
  switch (code) {
    case IDKitErrorCodes.Cancelled:
    case IDKitErrorCodes.UserRejected:
    case IDKitErrorCodes.VerificationRejected:
      return { status: 'cancelled' }
    case IDKitErrorCodes.MaxVerificationsReached:
      return { status: 'already_registered' }
    case IDKitErrorCodes.CredentialUnavailable:
    case IDKitErrorCodes.FeatureUnavailable:
    case IDKitErrorCodes.WorldId4NotAvailable:
      return {
        status: 'unavailable',
        reason:
          'This World ID does not hold the credential this check requires.',
      }
    case IDKitErrorCodes.ConnectionFailed:
      return {
        status: 'error',
        message: 'Could not reach World App. Check your connection.',
      }
    default:
      return { status: 'error', message: `World ID error: ${code}` }
  }
}
