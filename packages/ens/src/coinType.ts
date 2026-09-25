/** ENSIP-11 coinType for an EVM chain id. */
export function evmCoinType(chainId: number): number {
  return (0x80000000 | chainId) >>> 0
}
