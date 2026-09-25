/**
 * Sapore Pay web app — the public demo judges open.
 * Hackathon work starts here, one screen per commit: sign in →
 * dish list (Sapore API) → pay a cart (Privy embedded wallet on Tempo) →
 * become a Chef (IDKit / Proof of Human, plus the rejection path) →
 * claim `<chefAlias>.sapore.eth` on ENSv2 Sepolia → payout receipts.
 */
export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Sapore Pay</h1>
      <p>
        Stablecoin checkout &amp; creator payouts. Web app scaffold — ETHGlobal
        Tokyo 2026.
      </p>
    </main>
  )
}
