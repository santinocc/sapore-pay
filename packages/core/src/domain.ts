/**
 * Chain-agnostic domain model. Amounts are integers in the token's smallest
 * unit for on-chain values and in USD cents for the marketplace's view; the
 * two never mix in one field.
 */

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'refunded'

export interface OrderItem {
  /** Marketplace's id for the sold item (a recipe id in Sapore). */
  itemId: string
  /** Marketplace's id for the seller (a chef id). */
  sellerId: string
  /** Line total the buyer pays, USD cents. */
  amountUsdCents: number
}

export interface Order {
  id: string
  /** Marketplace-side buyer id (opaque to this service). */
  buyerId: string
  items: OrderItem[]
  totalUsdCents: number
  status: OrderStatus
  /** Memo the payer must attach (derived from `id`, see memo.ts). */
  memo: `0x${string}`
  createdAt: Date
  expiresAt: Date
}

export type PaymentRail = 'tempo' | 'world-chain' | 'external'

export interface Payment {
  orderId: string
  rail: PaymentRail
  chainId: number
  txHash: string
  token: string
  /** Amount received, token smallest unit. */
  amount: bigint
  payer: string
  observedAt: Date
}

export interface PayoutRecipient {
  sellerId: string
  /** Resolved destination (ENS name resolved to an address, snapshotted). */
  address: string
  ensName?: string
  amountUsdCents: number
}

export interface PayoutCycle {
  /** e.g. "2026-10-01" — one of 24 cycles per year (1st and 15th). */
  label: string
  recipients: PayoutRecipient[]
  treasuryUsdCents: number
  status: 'planned' | 'broadcast' | 'confirmed' | 'failed'
  txHash?: string
}
