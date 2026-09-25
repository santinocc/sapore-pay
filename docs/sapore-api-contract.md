# Sapore API contract for the public payments repo

> What the public `sapore-pay` service and demo web app (`apps/web`) may depend on from the
> private Sapore API, and what the private API adds for them. Copied from the private repo
> at kickoff so judges can see the integration surface without the private code.
> Base URL: `EXPO_PUBLIC_SERVER_URL` / `SAPORE_API_URL`. During ETHGlobal Tokyo the API
> is at `https://saporeserver-production.up.railway.app` — the `api.sapore.food` custom
> domain is deliberately not set up until after the event, so use the Railway host.

## Auth: wallet-login is the only path (revised 2026-09-25)

Sapore is crypto-only end to end, so there's no reason to run a separate
email+password+OTP signup in front of Privy. Privy's own email-OTP login
already proves the person controls that email, creates a durable
identity, and creates the wallet — all in one step, for Cooker and Chef
alike. A Sapore-specific credential system layered in front of that would
just prove the same thing twice.

**`POST /auth/wallet-login` (below) is the only auth endpoint, not an
alternate alongside password login.** It handles signup and login
identically: the private API creates a `User` row the first time it sees
a given wallet address, and returns the normal Sapore token either way —
there is no separate account-creation step, and no password field in the
data model.

`POST /auth/login`, `POST /auth/signup`, `POST /auth/oauth` just below are
inherited from Chefini's fiat/card-based fork ancestry, not a deliberate
choice for a crypto-only app — Chefini needs them for its Stripe-billed
identity; Sapore doesn't. Same status as the legacy crypto payment flow
further down: documented because it's what's currently deployed,
`apps/web` must not call it, and it's a candidate for removal from the
private repo once `/auth/wallet-login` fully replaces it there.

## Already exists (private repo, `packages/server/src/routes/*`)

| Method & path | Auth | Used by | Purpose |
|---|---|---|---|
| `POST /auth/login`, `POST /auth/signup`, `POST /auth/oauth` | — | Legacy — do not call from `apps/web`; see "Auth" above | Returns `{ token, user }`; token is RS256 (`kid` header), 30 days. |
| `GET /.well-known/jwks.json` | — | service | Public keys to verify Sapore access tokens (`iss` = `JWT_ISSUER`, default `sapore`). |
| `GET /recipes/explore?lat&lng&radiusKm…` | Bearer | `apps/web` | Nearby published dishes for the swipe/list view. |
| `GET /recipes/:id` | Bearer | `apps/web` | Dish detail (ingredients redacted until purchased). |
| `POST /payments/cart-quote` `{ recipeIds }` | Bearer | `apps/web`, service | `{ requiredUsd, breakdown[] }` — the authoritative cart total (already excludes owned recipes). |
| `GET /payments/purchased-recipes`, `GET /payments/check-purchase/:recipeId` | Bearer | `apps/web` | Cookbook / ownership checks after a payment lands. |
| `GET /users/me`, `GET /users/me/chef-profile` | Bearer | `apps/web` | Roles, chef alias/avatar/country, `payoutTermsAccepted`, current payout wallets. |
| `PATCH /users/me/wallet` `{ ethWalletAddress \| solWalletAddress }` | Bearer | `apps/web` | Enroll a payout address (48h lock rule applies). Worth revisiting once wallet-login lands: the "one Privy wallet per person, for both roles" decision (`docs/engineering-log.md`) means the login wallet and the payout wallet are the same address by default — this endpoint may only ever matter for the Solana address, or for the rare case of paying out somewhere other than the login wallet. |
| `POST /users/me/payout-terms/accept` | Bearer | `apps/web` | Consent gate every payout job checks. |

Legacy crypto flow (`POST /payments/crypto/register-sender`, `POST /payments/verify-crypto-cart`)
is what the service replaces; `apps/web` must not call it.

## To add in the private repo (thin glue; not judged, may be built before the event)

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /auth/wallet-login` `{ message, signature }` (SIWE) | — | **The only auth path** (see "Auth" above), for Cooker and Chef alike. Creates the `User` row on first sight of a wallet address, or links to the existing one on every return visit — same endpoint either way, since there's no separate signup step. Returns a normal Sapore token. |
| ✅ `POST /webhooks/pay` | HMAC (`X-Sapore-Pay-Signature: t=…,v1=…`, secret `PAY_WEBHOOK_SECRET`) | **Built 2026-09-25.** Receives `order.paid` → runs the marketplace's existing fulfillment side effects (purchase rows, chef earnings, tier sales, XP, referrals), idempotent on `orderId`. `payout.sent` / `payout.failed` are **rejected with 400** until the payout engine moves into this service — a 4xx stops the sender retrying, where a 200 would silently drop a money event. |
| `POST /payments/orders` `{ recipeIds }` | Bearer | Proxies to the service's `POST /orders` with the quoted total and returns `{ orderId, memo, amount, token, escrowAddress, expiresAt }` so the client never talks to the service with a user token. (Alternative: `apps/web` calls the service directly with the Sapore token; the service verifies it via JWKS.) |
| `GET /internal/payout/eligible-sales?cycle=YYYY-MM-DD` | `PAY_SERVICE_API_KEY` | Sales past the 2-cycle hold grouped by chef with `chefShare`, payout wallet / ENS name, terms status — the input to the batch builder. Returns `platformShare` totals for the treasury sweep. |
| `POST /internal/payout/mark` `{ cycle, items[] }` | `PAY_SERVICE_API_KEY` | Marks `Purchase.payoutStatus` paid/failed with tx hash (or the webhook does it — pick one; webhook preferred). |
| `PATCH /users/me/ens-name` `{ name }` | Bearer | Stores the claimed `alias.sapore.eth`; the service's ENS gateway reads chef records from the private API or from its own store (decide at kickoff; own store keeps the gateway self-contained). |
| `POST /users/me/world-id` `{ nullifierHash, action }` | Bearer | Records a verified World ID nullifier per action after the service verified the proof; gates chef onboarding and rewards. |

## Environment on the private API

```
PAY_SERVICE_URL=                # the deployed apps/service URL
PAY_SERVICE_API_KEY=            # presented to the service
PAY_WEBHOOK_SECRET=             # verifies webhooks from the service
```

`PAY_WEBHOOK_SECRET` on the marketplace and `WEBHOOK_SECRET` on this service
must be the same value byte for byte. The receiving side rejects every webhook
when its secret is unset, so a misconfigured deploy drops events loudly rather
than accepting unsigned ones.

## Data ownership

- Service DB (`sapore-pay`): `orders`, `payments`, `payout_cycles`, `payout_items`,
  `webhook_deliveries`, `ens_records`, `world_nullifiers` (or the last two in Sapore — decide once).
- Sapore DB: `Purchase`, `User`, `Recipe` remain the source of truth for ownership,
  entitlements and chef identity. The service never writes to them.
