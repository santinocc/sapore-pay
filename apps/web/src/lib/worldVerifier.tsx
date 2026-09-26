/**
 * worldVerifier.tsx — the real World ID verifier, behind humanVerifier.ts's
 * `HumanVerifier` interface.
 *
 * Why a hook returning a widget rather than a plain factory like
 * `createSimulatedVerifier`: IDKit is a mounted React component that owns a
 * modal, not a function you can await. `ChefOnboarding` is built around
 * `await verifier.verify(...)` — one call, one outcome — so this bridges the
 * two: the widget stays mounted and invisible, `verify()` opens it and
 * returns a promise, and IDKit's callbacks settle that promise.
 *
 * Every path settles exactly once, including the one IDKit has no callback
 * for — the person closing the modal without acting. That case is detected
 * by watching the modal's own open state, because a promise nobody resolves
 * would hang `ChefOnboarding` on its spinner forever (the same class of bug
 * that hung the ENS claim screen earlier — see docs/engineering-log.md).
 *
 * The browser never decides the outcome. `handleVerify` sends the proof to
 * apps/service, which asks World; only a server-confirmed proof reaches
 * `onSuccess`. Throwing inside `handleVerify` is IDKit's documented way to
 * reject a proof and show the person an error instead of a success screen.
 */

import type { ISuccessResult } from '@worldcoin/idkit'
import { IDKitWidget, useIDKit, VerificationLevel } from '@worldcoin/idkit'
import { useCallback, useEffect, useRef } from 'react'
import type { HumanVerifier, VerificationOutcome } from './humanVerifier'

export const WORLD_APP_ID = import.meta.env.VITE_WORLD_APP_ID ?? ''

/**
 * Orb by default: the product's whole claim is "one human, one Chef
 * account", and device-level credentials are per-device, not per-person.
 * Overridable to `device` only because a demo machine may not have an
 * Orb-verified World ID to hand — a weaker credential the operator opts into
 * knowingly, never a silent default.
 */
const VERIFICATION_LEVEL: VerificationLevel =
  import.meta.env.VITE_WORLD_VERIFICATION_LEVEL === 'device'
    ? VerificationLevel.Device
    : VerificationLevel.Orb

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
  const { open, setOpen } = useIDKit()
  const pending = useRef<((outcome: VerificationOutcome) => void) | null>(null)
  const wasOpen = useRef(false)

  // Stable across renders (only touches refs) so it can sit in the effect's
  // dependency array below without forcing that effect to re-run every render.
  const settle = useCallback((outcome: VerificationOutcome) => {
    const resolve = pending.current
    pending.current = null
    resolve?.(outcome)
  }, [])

  // IDKit has no "closed without finishing" callback, so the modal's own
  // open state is the signal. Only a true -> false transition with a promise
  // still pending is a cancellation; success closes it too, but by then
  // onSuccess has already settled and `pending` is null.
  useEffect(() => {
    if (wasOpen.current && !open && pending.current) {
      settle({ status: 'cancelled' })
    }
    wasOpen.current = open
  }, [open, settle])

  async function verifyOnServer(
    result: ISuccessResult,
  ): Promise<VerificationOutcome> {
    let res: Response
    try {
      res = await fetch(`${opts.serviceUrl}/world/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signal: opts.signal, proof: result }),
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
    verify() {
      if (!WORLD_APP_ID) {
        return Promise.resolve({
          status: 'error',
          message: 'World ID is not configured on this deployment.',
        })
      }
      return new Promise<VerificationOutcome>((resolve) => {
        pending.current = resolve
        setOpen(true)
      })
    },
  }

  const widget = WORLD_APP_ID ? (
    <IDKitWidget
      app_id={WORLD_APP_ID as `app_${string}`}
      action={opts.action}
      signal={opts.signal}
      verification_level={VERIFICATION_LEVEL}
      handleVerify={async (result) => {
        const outcome = await verifyOnServer(result)
        if (outcome.status !== 'verified') {
          // Settle first, then throw: the throw is what makes IDKit show its
          // own rejection screen instead of a success screen, but it would
          // otherwise leave our promise — and the screen awaiting it —
          // hanging.
          settle(outcome)
          throw new Error(rejectionMessage(outcome))
        }
      }}
      onSuccess={(result) => {
        settle({ status: 'verified', nullifierHash: result.nullifier_hash })
      }}
      onError={(error) => {
        settle(mapIdKitError(error.code, error.message))
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
 * IDKit's error codes onto outcomes the product already has screens for.
 * `max_verifications_reached` is the interesting one: it is World enforcing
 * one-proof-per-human-per-action, which is exactly the "already a Chef"
 * case, not a failure.
 */
function mapIdKitError(code: string, message?: string): VerificationOutcome {
  switch (code) {
    case 'verification_rejected':
      return { status: 'cancelled' }
    case 'max_verifications_reached':
      return { status: 'already_registered' }
    case 'credential_unavailable':
      return {
        status: 'unavailable',
        reason:
          'This World ID does not hold the credential this check requires.',
      }
    case 'connection_failed':
      return {
        status: 'error',
        message: 'Could not reach World App. Check your connection.',
      }
    default:
      return { status: 'error', message: message ?? `World ID error: ${code}` }
  }
}
