/**
 * World ID verification, checked server-side.
 *
 * The browser never decides whether someone is a unique human. IDKit runs in
 * apps/web and hands back a proof; this module — called from apps/service —
 * is what asks World whether that proof is real, using IDKit's own
 * `verifyCloudProof` (from `@worldcoin/idkit-core/backend`) rather than a
 * hand-rolled POST, so the request shape can't drift from the SDK's.
 *
 * Which SDK major this targets was a deliberate call, not an accident: the
 * current `@worldcoin/idkit` is 4.x, whose protocol requires a backend-signed
 * `rp_context` and a QR/polling flow. 2.4.2 is the last release of the
 * classic app_id/action/signal model, and 4.x still ships `orbLegacy` /
 * `deviceLegacy` presets described as "for compatibility with older IDKit
 * versions" — so v3 proofs, which is what this path produces, remain
 * first-class in the protocol. See docs/engineering-log.md for the full
 * reasoning and the time-risk tradeoff behind it.
 *
 * Uniqueness ("one human, one Chef account") is enforced by World itself, via
 * the per-action verification limit configured on `chef-onboarding` in the
 * Developer Portal — a second proof from the same person for the same action
 * comes back as `max_verifications_reached`. That is why this module stores
 * nothing: there is no local nullifier table to get out of sync, and the
 * nullifier it returns is for the caller to bind to an account, not for us to
 * keep here.
 */

import {
  type IVerifyResponse,
  verifyCloudProof,
} from '@worldcoin/idkit-core/backend'

/** Exactly the fields IDKit's `ISuccessResult` carries back from World App. */
export interface WorldProof {
  proof: string
  merkle_root: string
  nullifier_hash: string
  verification_level: string
}

export type WorldVerificationResult =
  /** World confirmed the proof. The nullifier is this human, scoped to this action. */
  | { status: 'verified'; nullifierHash: string }
  /**
   * This person already used their one verification for this action — World's
   * own per-action limit, which is what makes "one human, one Chef" true
   * without us keeping a nullifier table.
   */
  | { status: 'already_registered' }
  /** The proof didn't check out, or World rejected the request. */
  | { status: 'invalid'; code: string; detail: string }
  /** Never reached World — network, or the deployment has no app id configured. */
  | { status: 'error'; message: string }

export const NOT_CONFIGURED =
  'World ID is not configured on this deployment.' as const

/**
 * Asks World whether `proof` is a real, unspent proof of a unique human for
 * `action`, bound to `signal`.
 *
 * `signal` must be byte-identical to the one the browser passed to IDKit: it
 * is committed to inside the proof, so a proof captured for one account can't
 * be replayed to verify another. Passing a different value here doesn't fail
 * open — World rejects it.
 */
export async function verifyWorldProof(opts: {
  appId: string
  action: string
  signal: string
  proof: WorldProof
}): Promise<WorldVerificationResult> {
  if (!opts.appId) return { status: 'error', message: NOT_CONFIGURED }

  let response: IVerifyResponse
  try {
    response = await verifyCloudProof(
      opts.proof as Parameters<typeof verifyCloudProof>[0],
      opts.appId as `app_${string}`,
      opts.action,
      opts.signal,
    )
  } catch (err) {
    return { status: 'error', message: (err as Error).message }
  }

  if (response.success) {
    return { status: 'verified', nullifierHash: opts.proof.nullifier_hash }
  }

  // World's own name for "this person already did this action". Surfaced as
  // its own outcome because the product has a real screen for it, not a
  // generic failure toast.
  if (response.code === 'max_verifications_reached') {
    return { status: 'already_registered' }
  }

  return {
    status: 'invalid',
    code: response.code ?? 'unknown',
    detail: response.detail ?? 'World rejected the proof.',
  }
}
