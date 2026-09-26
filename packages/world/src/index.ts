/**
 * World ID verification, checked server-side.
 *
 * The browser never decides whether someone is a unique human. IDKit runs in
 * apps/web and hands back a proof; this module — called from apps/service —
 * is what asks World whether that proof is real.
 *
 * Two calls, two directions, both against World's own infrastructure:
 *
 *  - `fetchSignedRpContext()` — BEFORE a verification starts. IDKit's current
 *    protocol requires every request to carry a `rp_context`: a nonce/
 *    timestamp bundle signed by the app's RP signing key. Rather than us
 *    holding that key (real testing confirmed the app stays Developer-
 *    Portal-managed unless explicitly and irreversibly switched to
 *    self-managed — a step deliberately avoided here, since it changes
 *    on-chain transaction custody for the RP, not just this signature),
 *    World's own API signs it for us: this calls a Portal-hosted endpoint,
 *    authenticated with an API key, and returns the already-signed context.
 *  - `verifyWorldProof()` — AFTER the World App produces a proof. Forwards
 *    it, byte-for-byte, to World's verify endpoint. Deliberately NOT built
 *    on `@worldcoin/idkit-core/backend`'s `verifyCloudProof` helper anymore:
 *    that helper reshapes its input into the older v3 body shape (spreading
 *    the proof plus its own re-hashed `signal_hash`), and real testing
 *    showed the current endpoint wants the complete v4 result — a
 *    `responses` array — forwarded exactly as IDKit produced it, not
 *    remapped.
 *
 * Both endpoint URLs below are informed inference, not verified against
 * reachable docs (docs.world.org is blocked from this project's dev
 * sandbox) or installed SDK source — real, live testing is what will
 * confirm or correct them. See docs/engineering-log.md for the full trail:
 * what changed, why, and what's still inference vs. confirmed.
 *
 * Uniqueness ("one human, one Chef account") is enforced by World itself,
 * via the per-action verification limit configured on `chef-onboarding` in
 * the Developer Portal — a second proof from the same person for the same
 * action comes back as `max_verifications_reached`. That is why this module
 * stores nothing: there is no local nullifier table to get out of sync, and
 * the nullifier it returns is for the caller to bind to an account, not for
 * us to keep here.
 */

export const NOT_CONFIGURED =
  'World ID is not configured on this deployment.' as const

// Overridable via env for when the real host/path turns out to differ from
// this inference, without another deploy — see the module doc comment.
const RP_CONTEXT_ENDPOINT_BASE =
  process.env.WORLD_RP_CONTEXT_ENDPOINT_BASE ??
  'https://developer.worldcoin.org/api/v4/rp-context'
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
 * Asks World to sign a fresh `rp_context` for this app/action. Called once
 * per verification attempt, immediately before opening the IDKit widget —
 * `rp_context` carries its own short expiry, so it can't be fetched once and
 * reused across attempts.
 */
export async function fetchSignedRpContext(opts: {
  apiKey: string
  appId: string
  action: string
}): Promise<RpContextResult> {
  if (!opts.apiKey) return { status: 'error', message: NOT_CONFIGURED }

  const url = new URL(RP_CONTEXT_ENDPOINT_BASE)
  url.searchParams.set('app_id', opts.appId)
  url.searchParams.set('action', opts.action)

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
    })
  } catch (err) {
    return { status: 'error', message: (err as Error).message }
  }
  if (!res.ok) {
    return {
      status: 'error',
      message: `World returned ${res.status} fetching rp_context.`,
    }
  }

  const body = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  // Guarding both a flat response and one nested under `rp_context`, since
  // this endpoint's exact shape is inferred, not confirmed — see the module
  // doc comment.
  const rpContext = (body?.rp_context ?? body) as SignedRpContext | null
  if (!rpContext?.signature) {
    return {
      status: 'error',
      message: 'World did not return a signed rp_context.',
    }
  }
  return { status: 'ok', rpContext }
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
  // World's own name for "this person already did this action". Surfaced as
  // its own outcome because the product has a real screen for it, not a
  // generic failure toast.
  if (body.code === 'max_verifications_reached') {
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
