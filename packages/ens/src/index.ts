/**
 * ENS — implemented during the hackathon.
 * Planned: CCIP-Read gateway for `*.sapore.eth` (offchain subnames, ENSIP-10),
 * ENSv2 (Sepolia) registrar helpers with Enhanced Access Control, and an
 * IdentityResolver that reads addr(60) / addr(ENSIP-11 Tempo) records.
 */
/** ENSIP-11 coinType for an EVM chain id. */
export function evmCoinType(chainId: number): number {
  return (0x80000000 | chainId) >>> 0
}
