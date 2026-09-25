/**
 * recordWriter.ts — the UI-facing seam over writing a Chef's payout records.
 * Same reason as humanVerifier.ts and ensClaim.ts: every outcome is a
 * designed screen, and the screen has to be buildable before the real thing
 * exists behind it.
 *
 * Two real implementations, not one, because both are genuinely useful:
 *
 *  - createOnChainRecordWriter calls apps/service, which signs
 *    writeChefRecords() (from @sapore-pay/ens) with Sapore's own backend
 *    key. Works for any Chef regardless of whether they have a wallet
 *    connected — the demoable intermediate state docs/engineering-log.md
 *    describes.
 *  - createPrivyRecordWriter calls the exact same writeChefRecords()
 *    directly with the Chef's own Privy wallet client — the actual end
 *    state 03-authorize-chef.mjs's delegation exists for. Requires a
 *    connected wallet (see privyWallet.ts / WalletConnect.tsx).
 */

import type { PublicClient, WalletClient } from 'viem'
import {
  type ChefRecords,
  type WriteRecordsOutcome,
  writeChefRecords,
} from './ensRecords'

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

/** Real implementation — the Chef's own Privy wallet signs directly. */
export function createPrivyRecordWriter(
  publicClient: PublicClient,
  walletClient: WalletClient,
): RecordWriter {
  return {
    write: (fullName, records) =>
      writeChefRecords(publicClient, walletClient, fullName, records),
  }
}
