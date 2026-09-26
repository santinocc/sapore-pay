/**
 * World ID verification, checked server-side.
 *
 * The browser never decides whether someone is a unique human. IDKit runs in
 * apps/web and hands back a proof; this module — called from apps/service —
 * is what asks World whether that proof is real, using IDKit's own
 * `verifyCloudProof` (from `@worldcoin/idkit-core/backend`) rather than a
 * hand-rolled POST, so the request shape can't drift from the SDK's.
 *
 * One deliberate override on top of the SDK default: `verifyCloudProof`
 * hardcodes `/api/v2/verify/{app_id}`, which real-world testing showed
 * returns `{code: 'failed_by_host_app', message: 'Action not found.'}` for
 * an app created through the current (RP-based) Developer Portal — that
 * legacy endpoint can't see actions on an RP-structured app at all. The
 * current endpoint is `/api/v4/verify/{app_id | rp_id}` (app_id is
 * documented as still accepted, for backward compatibility). Only the URL
 * is overridden here, not the SDK's request body, so a wrong guess about
 * the domain/path is the one thing to re-check if this still fails — see
 * docs/engineering-log.md for what's actually confirmed vs. inferred.
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

// Overridable via env for when the real host/path turns out to differ from
// this inference (see the module doc comment above) without another deploy.
const VERIFY_ENDPOINT_BASE =
  process.env.WORLD_VERIFY_ENDPOINT_BASE ??
  'https://developer.worldcoin.org/api/v4/verify'

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
      `${VERIFY_ENDPOINT_BASE}/${opts.appId}`,
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
