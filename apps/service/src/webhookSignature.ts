import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * HMAC-SHA256 over `${timestamp}.${body}` — the same shape Stripe uses, so the
 * marketplace side can reuse its webhook-verification habits. The timestamp
 * bounds replay; the receiver rejects signatures older than `toleranceSec`.
 */
export function signWebhook(
  secret: string,
  body: string,
  timestamp = Date.now(),
): string {
  const ts = Math.floor(timestamp / 1000)
  const mac = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')
  return `t=${ts},v1=${mac}`
}

export function verifyWebhook(
  secret: string,
  body: string,
  header: string,
  opts: { now?: number; toleranceSec?: number } = {},
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('=') as [string, string]),
  )
  const ts = Number(parts.t)
  if (!Number.isFinite(ts) || !parts.v1) return false
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000)
  if (Math.abs(nowSec - ts) > (opts.toleranceSec ?? 300)) return false
  const expected = createHmac('sha256', secret)
    .update(`${ts}.${body}`)
    .digest('hex')
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(parts.v1, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
