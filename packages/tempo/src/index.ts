/**
 * Tempo adapter — implemented during the hackathon.
 * Planned: TempoPaymentIndexer (TransferWithMemo → Payment), TempoPayoutBroadcaster
 * (one atomic batch per cycle, memo = cycle label, fee paid in the stablecoin),
 * fee-sponsored client transfers. Uses `viem/tempo`.
 */
export const TEMPO_MAINNET_CHAIN_ID = 4217
export const TEMPO_TESTNET_CHAIN_ID = 42431 // Moderato
