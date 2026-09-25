import type { Order, Payment, PayoutCycle } from './domain.js'

/** Persistence owned by the payments service (never the marketplace's DB). */
export interface OrderStore {
  create(order: Order): Promise<void>
  get(id: string): Promise<Order | null>
  markPaid(id: string, payment: Payment): Promise<void>
  expireStale(now: Date): Promise<number>
}

/** Watches a chain for transfers to the escrow and yields matching payments. */
export interface PaymentIndexer {
  /** Resolve once; the implementation decides polling vs. websocket. */
  start(onPayment: (payment: Payment) => Promise<void>): Promise<void>
  stop(): Promise<void>
}

/** Sends one payout cycle as a single (ideally atomic) batch. */
export interface PayoutBroadcaster {
  broadcast(cycle: PayoutCycle): Promise<{ txHash: string }>
}

/** Delivers signed webhooks to the marketplace. */
export interface WebhookSender {
  send(event: WebhookEvent): Promise<void>
}

export type WebhookEvent =
  | { type: 'order.paid'; order: Order; payment: Payment }
  | { type: 'order.expired'; orderId: string }
  | { type: 'payout.sent'; cycle: PayoutCycle }
  | { type: 'payout.failed'; cycle: PayoutCycle; reason: string }

/** Maps a seller's identity (e.g. ENS name) to a payout address. */
export interface IdentityResolver {
  resolvePayoutAddress(sellerId: string): Promise<{
    address: string
    ensName?: string
  } | null>
}

/** Proof-of-human gate (World ID): verified server-side, never client-side. */
export interface HumanVerifier {
  verify(input: {
    action: string
    proof: unknown
    nullifierHash: string
    merkleRoot: string
    signal?: string
  }): Promise<
    { ok: true; nullifierHash: string } | { ok: false; reason: string }
  >
}
