/**
 * World ID verification, checked server-side.
 *
 * The browser never decides whether someone is a unique human. IDKit runs in
 * apps/web and hands back a proof; this module — called from apps/service —
 * is what asks World whether that proof is real.
 *
 * CORRECTION (see docs/engineering-log.md, Fri 26 Sept): an earlier version
 * of this module fetched `rp_context` from a guessed Portal-hosted cloud
 * endpoint, authenticated with an API key. Live testing returned a real 404
 * — that endpoint doesn't exist. Reading `@worldcoin/idkit-server`'s actual
 * installed source (not search results) settled it: the SDK's only signing
 * path is `signRequest({signingKeyHex, ...})`, a pure local computation over
 * a raw private key. There is no cloud "sign this for me" call in the
 * protocol — every RP, whatever the Developer Portal's "self-managed"
 * toggle means, needs its own signing key sitting in a server-only secret
 * store. `buildSignedRpContext()` is that local computation now — no
 * network call at all, which is also why it's synchronous.
 *
 *  - `buildSignedRpContext()` — BEFORE a verification starts. Signs a fresh
 *    nonce/timestamp bundle with the RP's own key, entirely locally.
 *  - `verifyWorldProof()` — AFTER the World App produces a proof. Forwards
 *    it, byte-for-byte, to World's verify endpoint. This one *is* confirmed
 *    by live testing: pointing it at `/api/v4/verify/{app_id}` changed the
 *    server's answer from "Action not found." (v2 endpoint, wrong protocol
 *    entirely) to "responses array is required" (right endpoint, proof body
 *    still v2-shaped at the time) — the URL below is real, not inferred.
 *
 * Uniqueness ("one human, one Chef account") is enforced by World itself:
 * a second proof from the same person for the same action reuses that
 * person's per-action nullifier, and World rejects it as `nullifier_replayed`
 * (confirmed by live testing — verifying twice with the same World ID on
 * `chef-onboarding`; `max_verifications_reached` is kept as an alias for the
 * same product outcome, in case a higher per-action limit ever surfaces it
 * instead). That is why this module stores nothing: there is no local
 * nullifier table to get out of sync, and the nullifier it returns is for
 * the caller to bind to an account, not for us to keep here.
 */

import { signRequest } from '@worldcoin/idkit-server'

export const NOT_CONFIGURED =
  'World ID is not configured on this deployment.' as const

// Confirmed by live testing (see module doc comment) — not inference.
const VERIFY_ENDPOINT_BASE =
  process.env.WORLD_VERIFY_ENDPOINT_BASE ??
  'https://developer.worldcoin.org/api/v4/verify'

/** What IDKit's `IDKitRequestConfig.rp_context` needs, verbatim. */
export interface SignedRpContext {
  rp_id: string
  nonce: string
  created_at: number
  expires_at: number
  signature: string
}

export type RpContextResult =
  | { status: 'ok'; rpContext: SignedRpContext }
  | { status: 'error'; message: string }

/**
 * Signs a fresh `rp_context` for this RP/action, locally — called once per
 * verification attempt, immediately before opening the IDKit widget.
 * `rp_context` carries its own short expiry, so it can't be fetched once and
 * reused across attempts. `ttl` is generous (10 minutes) because the real
 * flow includes a person picking up their phone and confirming in World
 * App, not just opening a modal.
 */
export function buildSignedRpContext(opts: {
  signingKeyHex: string
  rpId: string
  action: string
}): RpContextResult {
  if (!opts.signingKeyHex || !opts.rpId) {
    return { status: 'error', message: NOT_CONFIGURED }
  }

  let signed: {
    sig: string
    nonce: string
    createdAt: number
    expiresAt: number
  }
  try {
    signed = signRequest({
      signingKeyHex: opts.signingKeyHex,
      action: opts.action,
      ttl: 600,
    })
  } catch (err) {
    return { status: 'error', message: (err as Error).message }
  }

  return {
    status: 'ok',
    rpContext: {
      rp_id: opts.rpId,
      nonce: signed.nonce,
      created_at: signed.createdAt,
      expires_at: signed.expiresAt,
      signature: signed.sig,
    },
  }
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

/**
 * Forwards `proof` — the complete, unmodified result IDKit's `onSuccess`/
 * `handleVerify` handed the browser — to World's verify endpoint.
 *
 * Deliberately typed as `Record<string, unknown>` rather than a narrow
 * interface: the whole point is to forward exactly what IDKit produced,
 * not a hand-picked subset that could silently drop a field the endpoint
 * needs.
 */
export async function verifyWorldProof(opts: {
  appId: string
  proof: Record<string, unknown>
}): Promise<WorldVerificationResult> {
  if (!opts.appId) return { status: 'error', message: NOT_CONFIGURED }

  let res: Response
  try {
    res = await fetch(`${VERIFY_ENDPOINT_BASE}/${opts.appId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts.proof),
    })
  } catch (err) {
    return { status: 'error', message: (err as Error).message }
  }

  const body = (await res.json().catch(() => ({}))) as {
    code?: string
    message?: string
    detail?: string
  }

  if (res.ok) {
    return { status: 'verified', nullifierHash: extractNullifier(opts.proof) }
  }
  // World's own names for "this person already did this action" — confirmed
  // by live testing to be `nullifier_replayed` in practice (a second proof
  // from the same person reuses the same per-action nullifier), with
  // `max_verifications_reached` kept alongside it since it's the same
  // product outcome under a different name for a per-action limit set above
  // one. Surfaced as its own outcome because the product has a real screen
  // for it, not a generic failure toast.
  if (
    body.code === 'nullifier_replayed' ||
    body.code === 'max_verifications_reached'
  ) {
    return { status: 'already_registered' }
  }
  return {
    status: 'invalid',
    code: body.code ?? 'unknown',
    detail: body.message ?? body.detail ?? 'World rejected the proof.',
  }
}

/** v4's nullifier lives per-credential-response, not at the top level. */
function extractNullifier(proof: Record<string, unknown>): string {
  const responses = proof.responses
  if (Array.isArray(responses) && responses.length > 0) {
    const first = responses[0] as Record<string, unknown>
    if (typeof first.nullifier === 'string') return first.nullifier
  }
  return 'unknown'
}
