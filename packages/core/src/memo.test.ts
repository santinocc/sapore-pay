import { describe, expect, it } from 'vitest'
import { decodeOrderMemo, encodeOrderMemo } from './memo.js'

describe('order memo', () => {
  it('round-trips an order id through a 32-byte memo', () => {
    const memo = encodeOrderMemo('ord_01J8Z3Q7K9M2N4P6R8T0V2X4Y6')
    expect(memo).toMatch(/^0x[0-9a-f]{64}$/)
    expect(decodeOrderMemo(memo)).toBe('ord_01J8Z3Q7K9M2N4P6R8T0V2X4Y6')
  })

  it('rejects ids longer than 32 bytes', () => {
    expect(() => encodeOrderMemo('x'.repeat(33))).toThrow(/1–32 bytes/)
  })

  it('rejects malformed memos', () => {
    expect(() => decodeOrderMemo('0x1234')).toThrow(/32 bytes/)
  })
})
