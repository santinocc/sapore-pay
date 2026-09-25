# Sapore Pay

Open-source **stablecoin checkout and creator payouts** for marketplaces, built at
ETHGlobal Tokyo 2026 (Sept 25–27) for the recipe marketplace [Sapore](#pre-existing-work).

- Cookers pay a recipe with one tap: TIP-20 transfers on **Tempo**, reconciled by
  on-chain memo, gas sponsored, signed from a **Privy** embedded wallet.
- Chefs are paid in one atomic batch per cycle to `alias.sapore.eth` (**ENS**),
  from an escrow held in a policy-controlled **Privy** server wallet.
- Chef accounts are unique humans (**World ID**), so rewards can't be farmed.
- Fiat on/off-ramps via **Bridge** (phase 2).

> Status: hackathon in progress. Watch the commit history — every step lands as
> its own small commit.

## Layout

| Path | What lives here |
|---|---|
| `packages/core` | Chain-agnostic domain: orders, payments, payout cycles, and the **ports** every adapter implements. No provider code. |
| `packages/tempo` | Tempo adapter: memo-tagged TIP-20 transfers, fee sponsorship, event indexer, batch payouts. |
| `packages/privy` | Privy glue: verify Sapore RS256 tokens for custom auth, server-wallet signing for escrow/treasury. |
| `packages/bridge` | Bridge on/off-ramp + virtual accounts. |
| `packages/ens` | `*.sapore.eth` subnames: CCIP-Read gateway resolver and ENSv2 registrar helpers. |
| `packages/world` | World ID verification via IDKit, checked server-side (cloud verify). Gates Chef onboarding only — see `docs/engineering-log.md`. |
| `packages/sdk` | Typed HTTP client used by the Sapore API (and any other marketplace). |
| `apps/service` | Deployable payments API: orders, indexer, webhooks, payout scheduler. |
| `apps/web` | The public demo client: sign in, pay a cart, verify with World ID, claim a subname. This is the live demo judges open. |

## Architecture

```
 Marketplace app (private)             sapore-pay (this repo)
 ┌──────────────────────────┐  REST+HMAC  ┌──────────────────────────────────┐
 │ API: /webhooks/pay,      │◄───────────►│ apps/service                     │
 │ eligible-sales, JWKS     │             │  orders · indexer · webhooks ·   │
 │ App: "Pay with wallet"   │             │  payout scheduler · ENS gateway  │
 └──────────────────────────┘             └──────┬───────────────────────────┘
                                                 │
        apps/web (public demo)  ─────────────────┘
                 Tempo · Privy · Bridge · World Chain · ENS (Sepolia / mainnet)
```

## Pre-existing work

This repo was created at the hackathon kickoff. The marketplace it plugs into,
**Sapore** (React Native + Expo, Express, MongoDB — private repo), existed before the
event with a legacy "paste a transaction hash" crypto flow and an RS256 login whose
public keys are published at `/.well-known/jwks.json`. Nothing from that codebase is
copied here; the integration points it exposes are listed in
[`docs/sapore-api-contract.md`](docs/sapore-api-contract.md).

## Develop

```
pnpm install
pnpm build && pnpm test && pnpm lint
pnpm dev:service      # http://localhost:4000/health
pnpm dev:web          # Vite dev server
```

## License

MIT — see [LICENSE](LICENSE).
