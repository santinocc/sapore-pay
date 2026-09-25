/**
 * ensClaim.ts — claiming `<alias>.sapore.eth` on ENSv2 Sepolia.
 *
 * Same shape as humanVerifier.ts, for the same reason: every outcome of
 * claiming a name is a real product state (taken, invalid, claiming, failed),
 * not an exception path — and the ENS card fails demos with hard-coded
 * values, so the interface has to be real enough that swapping the
 * implementation is the only thing that changes between "simulated" and
 * "on-chain."
 *
 * `sapore.eth` itself is real: registered on ENSv2 Sepolia,
 * tx 0x544e55dc42d4222d6a6641bb202f492a318cec39896cf06f60fb4cbdb2736260,
 * block 11780643 (see docs/engineering-log.md). It was registered with
 * `resolver = address(0)` — no resolver set — on purpose: creating
 * `<alias>.sapore.eth` as a subname requires the Permissioned Registry /
 * subname-registrar mechanics ENSv2's "For Contract Developers" guide covers,
 * which this session hasn't read yet (network-restricted; couldn't fetch it).
 * `createOnChainSubnameClaimer` below is left as an honest stub for that
 * reason, matching how `createWorldVerifier` was stubbed before
 * WORLD_APP_ID existed. `createSimulatedSubnameClaimer` drives every state
 * until then, and stays afterward as a fast local demo path.
 */

const RESERVED_ALIASES = new Set([
  'www',
  'app',
  'api',
  'admin',
  'sapore',
  'mail',
  'support',
])

const ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

export type AliasValidation = { valid: true } | { valid: false; reason: string }

/** Client-side shape check — the real answer is always the chain's. */
export function validateAlias(alias: string): AliasValidation {
  const a = alias.trim().toLowerCase()
  if (a.length < 3) return { valid: false, reason: 'At least 3 characters.' }
  if (a.length > 32) return { valid: false, reason: 'At most 32 characters.' }
  if (!ALIAS_PATTERN.test(a)) {
    return {
      valid: false,
      reason: 'Lowercase letters, numbers and single hyphens only.',
    }
  }
  if (RESERVED_ALIASES.has(a)) {
    return { valid: false, reason: 'This name is reserved.' }
  }
  return { valid: true }
}

export type ClaimOutcome =
  /** The subname is registered and owned by `ownerAddress`. No resolver yet. */
  | { status: 'claimed'; fullName: string; txHash: string }
  /** Someone else already holds this alias. */
  | { status: 'taken'; fullName: string }
  /** Failed client-side validation or a chain-side equivalent rejection. */
  | { status: 'invalid'; reason: string }
  /** Chain call failed — network, gas, or a revert. */
  | { status: 'error'; message: string }

export interface SubnameClaimer {
  isAvailable(alias: string): Promise<boolean>
  /** Claims `<alias>.sapore.eth` for `ownerAddress`. */
  claim(alias: string, ownerAddress: `0x${string}`): Promise<ClaimOutcome>
}

export type SimulatedClaimScenario = 'claimed' | 'taken' | 'error'

/** Aliases pre-seeded as "already claimed" in the simulator, for the "taken" demo path. */
const SIMULATED_TAKEN = new Set(['marco', 'sapore', 'chef'])

export function createSimulatedSubnameClaimer(
  scenario: SimulatedClaimScenario,
  delayMs = 1200,
): SubnameClaimer {
  return {
    async isAvailable(alias) {
      await new Promise((r) => setTimeout(r, delayMs / 2))
      if (scenario === 'taken') return false
      return !SIMULATED_TAKEN.has(alias.trim().toLowerCase())
    },
    async claim(alias, _ownerAddress): Promise<ClaimOutcome> {
      await new Promise((r) => setTimeout(r, delayMs))
      const fullName = `${alias.trim().toLowerCase()}.sapore.eth`
      if (scenario === 'taken') return { status: 'taken', fullName }
      if (scenario === 'error') {
        return { status: 'error', message: 'Transaction reverted.' }
      }
      return {
        status: 'claimed',
        fullName,
        // Shaped like a real Sepolia tx hash so nothing downstream is
        // surprised by its length once this is real.
        txHash: `0x${'c1a1'.repeat(16)}`,
      }
    },
  }
}

/**
 * Real claimer. Deliberately incomplete — see the file header. Creating a
 * subname under `sapore.eth` needs the Permissioned Registry mechanics
 * ENSv2's contract-developer guide covers; wiring this without reading that
 * guide first would mean guessing a contract interface for something that
 * moves real ownership on-chain, which is the wrong place to guess.
 */
export function createOnChainSubnameClaimer(_opts: {
  parentName: string
}): SubnameClaimer {
  return {
    async isAvailable() {
      throw new Error(
        'createOnChainSubnameClaimer is not implemented yet — see ensClaim.ts header.',
      )
    },
    async claim(): Promise<ClaimOutcome> {
      return {
        status: 'error',
        message: 'Subname registration is not wired yet on this deployment.',
      }
    },
  }
}
