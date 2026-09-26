/**
 * humanVerifier.ts — the Proof-of-Human gate behind one interface.
 *
 * Why an interface rather than calling IDKit directly from the screen:
 *
 *  1. **The rejection path is a first-class outcome, not an exception.** World's
 *     prize scores "a successful verification AND one meaningful alternative
 *     path". If cancellation and an already-used credential arrive as thrown
 *     errors, they end up in a catch block rendering a toast. Modelled as
 *     outcomes, every one of them has to be a designed screen — the compiler
 *     insists.
 *  2. It lets the whole flow be built and demoed before `WORLD_APP_ID` exists,
 *     and lets the demo show the rejection path on purpose rather than by
 *     breaking something.
 *
 * The trust decision is never made here. This returns what the *server* said
 * after it called `POST /api/v2/verify/{app_id}`; the browser never decides
 * whether a human is verified, and a nullifier that reaches this code is
 * already spent server-side.
 */

/** The action id registered in the World Developer Portal. One trust moment. */
export const CHEF_ONBOARDING_ACTION = 'chef-onboarding'

export type VerificationOutcome =
  /** Server verified the proof. The nullifier is now bound to this account. */
  | { status: 'verified'; nullifierHash: string }
  /** The person closed the World modal. Not a failure — a choice. */
  | { status: 'cancelled' }
  /**
   * This human already has a Chef account. The nullifier is scoped per action,
   * so World itself enforces one-per-person; we surface *why*, not a 409.
   */
  | { status: 'already_registered'; existingChefAlias?: string }
  /** No World ID available on this device / credential not held. */
  | { status: 'unavailable'; reason: string }
  /** Anything else — network, server, malformed proof. */
  | { status: 'error'; message: string }

export interface HumanVerifier {
  /** `signal` binds the proof to this account so it can't be replayed elsewhere. */
  verify(action: string, signal: string): Promise<VerificationOutcome>
}

/**
 * Stand-in used until the World app id and action exist, and kept afterwards to
 * drive the alternative-path demo. Every branch it returns is a branch the real
 * verifier can also return, so no screen is written against a fiction.
 */
export type SimulatedScenario =
  | 'verified'
  | 'cancelled'
  | 'already_registered'
  | 'unavailable'
  | 'error'

export function createSimulatedVerifier(
  scenario: SimulatedScenario,
  delayMs = 1600,
): HumanVerifier {
  return {
    async verify(): Promise<VerificationOutcome> {
      await new Promise((r) => setTimeout(r, delayMs))
      switch (scenario) {
        case 'verified':
          return {
            status: 'verified',
            // Shaped like a real nullifier so nothing downstream is surprised
            // by its length when the real verifier is wired in.
            nullifierHash: `0x${'7c4f'.repeat(16)}`,
          }
        case 'cancelled':
          return { status: 'cancelled' }
        case 'already_registered':
          return { status: 'already_registered', existingChefAlias: 'marco' }
        case 'unavailable':
          return {
            status: 'unavailable',
            reason: 'No World ID credential found on this device.',
          }
        case 'error':
          return {
            status: 'error',
            message: 'Verification service unreachable.',
          }
      }
    },
  }
}

/**
 * The real verifier lives in worldVerifier.tsx, not here: IDKit is a mounted
 * React component that owns a modal, so it has to be a hook returning both a
 * verifier and a widget, rather than a plain factory like the simulated one
 * above. It implements this same `HumanVerifier` interface — which is the
 * whole point of having one: every screen written against the simulated
 * verifier works unchanged against the real one.
 */
