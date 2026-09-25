/**
 * Order ↔ 32-byte memo. TIP-20 transfers on Tempo carry a 32-byte memo that
 * is emitted in the TransferWithMemo event; encoding the order id into it
 * lets the indexer reconcile payments without per-order deposit addresses.
 */

const HEX = /^[0-9a-f]+$/i

export function encodeOrderMemo(orderId: string): `0x${string}` {
  const bytes = new TextEncoder().encode(orderId)
  if (bytes.length === 0 || bytes.length > 32) {
    throw new Error(
      `orderId must be 1–32 bytes when UTF-8 encoded, got ${bytes.length}`,
    )
  }
  const padded = new Uint8Array(32)
  padded.set(bytes)
  return `0x${Array.from(padded, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export function decodeOrderMemo(memo: string): string {
  const hex = memo.startsWith('0x') ? memo.slice(2) : memo
  if (hex.length !== 64 || !HEX.test(hex)) {
    throw new Error('memo must be 32 bytes of hex')
  }
  const bytes = Uint8Array.from(hex.match(/.{2}/g) ?? [], (h) =>
    Number.parseInt(h, 16),
  )
  let end = bytes.length
  while (end > 0 && bytes[end - 1] === 0) end--
  return new TextDecoder().decode(bytes.subarray(0, end))
}
