/**
 * ENS — implemented during the hackathon.
 * Planned: CCIP-Read gateway for `*.sapore.eth` (offchain subnames, ENSIP-10),
 * ENSv2 (Sepolia) registrar helpers with Enhanced Access Control, and an
 * IdentityResolver that reads addr(60) / addr(ENSIP-11 Tempo) records.
 */

export {
  type ChefRecords,
  type WriteRecordsOutcome,
  writeChefRecords,
} from './chefRecords.js'
export { evmCoinType } from './coinType.js'
