# Sapore API contract for the public payments repo

> What the public `sapore-pay` service and demo web app (`apps/web`) may depend on from the
> private Sapore API, and what the private API adds for them. Copied from the private repo
> at kickoff so judges can see the integration surface without the private code.
> Base URL: `EXPO_PUBLIC_SERVER_URL` / `SAPORE_API_URL`. During ETHGlobal Tokyo the API
> is at `https://saporeserver-production.up.railway.app` — the `api.sapore.food` custom
> domain is deliberately not set up until after the event, so use the Railway host.

## Already exists (private repo, `packages/server/src/routes/*`)

| Method & path | Auth | Used by | Purpose |
|---|---|---|---|
| `POST /auth/login`, `POST /auth/signup`, `POST /auth/oauth` | — | `apps/web` (fallback login) | Returns `{ token, user }`; token is RS256 (`kid` header), 30 days. |
| `GET /.well-known/jwks.json` | — | service, Privy | Public keys to verify Sapore access tokens (`iss` = `JWT_ISSUER`, default `sapore`). |
| `GET /recipes/explore?lat&lng&radiusKm…` | Bearer | `apps/web` | Nearby published dishes for the swipe/list view. |
| `GET /recipes/:id` | Bearer | `apps/web` | Dish detail (ingredients redacted until purchased). |
| `POST /payments/cart-quote` `{ recipeIds }` | Bearer | `apps/web`, service | `{ requiredUsd, breakdown[] }` — the authoritative cart total (already excludes owned recipes). |
| `GET /payments/purchased-recipes`, `GET /payments/check-purchase/:recipeId` | Bearer | `apps/web` | Cookbook / ownership checks after a payment lands. |
| `GET /users/me`, `GET /users/me/chef-profile` | Bearer | `apps/web` | Roles, chef alias/avatar/country, `payoutTermsAccepted`, current payout wallets. |
| `PATCH /users/me/wallet` `{ ethWalletAddress \| solWalletAddress }` | Bearer | `apps/web` | Enroll a payout address (48h lock rule applies). |
| `POST /users/me/payout-terms/accept` | Bearer | `apps/web` | Consent gate every payout job checks. |

Legacy crypto flow (`POST /payments/crypto/register-sender`, `POST /payments/verify-crypto-cart`)
is what the service replaces; `apps/web` must not call it.

## To add in the private repo (thin glue; not judged, may be built before the event)

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /auth/wallet-login` `{ message, signature }` (SIWE) | — | `apps/web` sign-in with the Privy embedded wallet. Creates or links the account by verified address and returns a normal Sapore token. |
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
