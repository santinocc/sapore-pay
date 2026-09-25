import { describe, expect, it } from 'vitest'
import { signWebhook, verifyWebhook } from './webhookSignature.js'

describe('webhook signature', () => {
  const secret = 'whsec_test'
  const body = JSON.stringify({ type: 'order.paid', orderId: 'ord_1' })

  it('verifies what it signed', () => {
    const header = signWebhook(secret, body, 1_800_000_000_000)
    expect(
      verifyWebhook(secret, body, header, { now: 1_800_000_000_000 }),
    ).toBe(true)
  })

  it('rejects a tampered body, a wrong secret, and a stale timestamp', () => {
    const header = signWebhook(secret, body, 1_800_000_000_000)
    expect(
      verifyWebhook(secret, `${body} `, header, { now: 1_800_000_000_000 }),
    ).toBe(false)
    expect(
      verifyWebhook('other', body, header, { now: 1_800_000_000_000 }),
    ).toBe(false)
    expect(
      verifyWebhook(secret, body, header, {
        now: 1_800_000_000_000 + 10 * 60_000,
      }),
    ).toBe(false)
  })
})
