/**
 * recordWriter.ts — the UI-facing seam over ensRecords.ts's real
 * writeChefRecords(). Same reason as humanVerifier.ts and ensClaim.ts: every
 * outcome is a designed screen, and the screen has to be buildable before a
 * Privy wallet is wired into apps/web.
 *
 * createOnChainRecordWriter is a thin wrapper, not a stub — it calls the real
 * function. It just needs real viem clients, which this scaffold doesn't
 * construct yet (no Privy embedded-wallet integration in apps/web so far).
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

/** Real implementation — calls writeChefRecords() against actual clients. */
export function createOnChainRecordWriter(
  publicClient: PublicClient,
  walletClient: WalletClient,
): RecordWriter {
  return {
    write: (fullName, records) =>
      writeChefRecords(publicClient, walletClient, fullName, records),
  }
}
