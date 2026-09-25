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
 * block 11780643 (see docs/engineering-log.md). `createOnChainSubnameClaimer`
 * below now calls apps/service's real endpoints — see
 * contracts/subname-registrar/ for the deployed `SaporeChefRegistrar` this
 * hits, and docs/engineering-log.md for the full deploy/verification trail.
 * Claiming has to happen backend-side, not from the browser: `register()`
 * reverts for anyone but the address `SaporeChefRegistrar` was deployed
 * with as `backend`, which is Sapore's own key, never shipped to the
 * client. `createSimulatedSubnameClaimer` stays as the fast local demo path.
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
 * Real claimer. Calls apps/service, which holds the deployed
 * `SaporeChefRegistrar` address and the backend key `register()` requires —
 * see the file header for why that can't move to the browser.
 */
export function createOnChainSubnameClaimer(opts: {
  serviceUrl: string
}): SubnameClaimer {
  return {
    async isAvailable(alias) {
      const label = alias.trim().toLowerCase()
      const res = await fetch(
        `${opts.serviceUrl}/ens/chef/${encodeURIComponent(label)}/availability`,
      )
      if (!res.ok) {
        throw new Error(`Service returned ${res.status} checking availability`)
      }
      const body = (await res.json()) as { available: boolean }
      return body.available
    },
    async claim(alias, ownerAddress): Promise<ClaimOutcome> {
      const label = alias.trim().toLowerCase()
      let res: Response
      try {
        res = await fetch(`${opts.serviceUrl}/ens/chef/claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ label, ownerAddress }),
        })
      } catch (err) {
        return { status: 'error', message: (err as Error).message }
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        return {
          status: 'error',
          message: body?.message ?? `Service returned ${res.status}`,
        }
      }
      return (await res.json()) as ClaimOutcome
    },
  }
}
