/**
 * recordWriter.ts — the UI-facing seam over writing a Chef's payout records.
 * Same reason as humanVerifier.ts and ensClaim.ts: every outcome is a
 * designed screen, and the screen has to be buildable before the real thing
 * exists behind it.
 *
 * createOnChainRecordWriter calls apps/service, which signs the actual
 * writeChefRecords() call (from @sapore-pay/ens) with Sapore's own backend
 * key — not the browser, since apps/web has no embedded wallet yet (no
 * Privy integration). This is a real on-chain write today, just backend-
 * mediated rather than Chef-signed; see docs/engineering-log.md for why
 * that's a deliberate, demoable intermediate state rather than a stub.
 * Once Privy wires a real wallet client into the browser, this becomes a
 * direct call to writeChefRecords() with the Chef's own key — the resolver
 * side (03-authorize-chef.mjs's delegation) is already set up for that; only
 * this file's implementation changes, not the interface below.
 */

import type { ChefRecords, WriteRecordsOutcome } from './ensRecords'

export interface RecordWriter {
  write(fullName: string, records: ChefRecords): Promise<WriteRecordsOutcome>
}

export type SimulatedRecordScenario =
  | 'written'
  | 'no_resolver'
  | 'unauthorized'
  | 'error'

export function createSimulatedRecordWriter(
  scenario: SimulatedRecordScenario,
  delayMs = 1400,
): RecordWriter {
  return {
    async write(): Promise<WriteRecordsOutcome> {
      await new Promise((r) => setTimeout(r, delayMs))
      switch (scenario) {
        case 'written':
          return {
            status: 'written',
            txHash: `0x${'f00d'.repeat(16)}`,
            resolver: '0x1111111111111111111111111111111111111111',
          }
        case 'no_resolver':
          return { status: 'no_resolver' }
        case 'unauthorized':
          return { status: 'unauthorized' }
        case 'error':
          return { status: 'error', message: 'Transaction reverted.' }
      }
    },
  }
}

/** Real implementation — calls apps/service, which writes on-chain. */
export function createOnChainRecordWriter(opts: {
  serviceUrl: string
}): RecordWriter {
  return {
    async write(fullName, records): Promise<WriteRecordsOutcome> {
      let res: Response
      try {
        res = await fetch(`${opts.serviceUrl}/ens/chef/records`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fullName, ...records }),
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
      return (await res.json()) as WriteRecordsOutcome
    },
  }
}
