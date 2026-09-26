# Engineering log — Sapore Pay @ ETHGlobal Tokyo 2026

Append-only. Newest entries at the bottom. Times are **JST** (UTC+9).

This log exists for a specific reason: World's IDKit prize (requirement 5) asks for an
integration debrief containing *time to first successful verification*, friction
encountered, missing capability or documentation, and the single highest-impact
improvement. Those are stopwatch readings and in-the-moment observations — they cannot be
reconstructed at hour 35. Everything relevant gets written down as it happens, whether or
not it is flattering.

## Stopwatch

| Milestone | Target | Reached | Elapsed from kickoff |
|---|---|---|---|
| Hackathon kickoff | Fri 21:00 | Fri 21:00 | 0:00 |
| Public repo, first commit | +0:45 | Fri 21:35 | 0:35 |
| World Developer Portal app + `chef-onboarding` action live | — | Fri, live during manual-tasks walkthrough | — |
| First IDKit line written | — | _pending_ | — |
| **First successful World ID verification** | — | _pending_ | — |
| `sapore.eth` registered on ENSv2 Sepolia | — | Fri, block 11780643 | — |
| First ENSv2 Sepolia name resolved by the service | — | _pending_ | — |
| First memo'd Tempo transfer reconciled to an order | — | _pending_ | — |
| `apps/web` live on a public URL | +6:00 | _pending — Railway services not created yet_ | — |

## Friction / doc gaps

Recorded as encountered, tagged by provider. Rolled up into the World debrief at the end.

| # | Provider | What | Cost |
|---|---|---|---|
| 1 | Tooling (not a sponsor) | Push access to the public repo was refused on the first push — the GitHub App was not installed on `santinocc/sapore-pay`, so the scaffold commit sat local until it was fixed. Not a sponsor issue, but it is the first thing that cost wall-clock time. | ~20 min |
| 2 | Environment (not a sponsor) | `mongodb-memory-server` fetches a `mongod` binary on first run and every MongoDB download host is denied by the build environment's network policy. No DB-backed test can run locally, so CI is the only place they execute. Shapes the whole build: push early, read the run, fix, push again. | ongoing |

---

## Fri 25 Sept

### 21:00 — kickoff

Clock started. Plan of record is the private repo's `docs/hackathon/ethglobal-tokyo-2026.md`,
rewritten earlier today against the published World and ENS prize cards.

Targets, both **Continuity Track variants**:

- **World — `[Cont] Best IDKit Use Case`, $2,500.** One trust moment (Chef onboarding), one
  credential (Proof of Human), argued as the minimum sufficient assurance.
- **ENS — `[Cont] Best Integration of ENSv2 into an Existing Project`, $4,000.** ENSv2 on
  Sepolia, Enhanced Access Control as the central mechanic, payout engine resolving names
  instead of a Mongo field.
- Curvegrid RWA ($1,000) is a third priority and is droppable without regret.

### 21:35 — public repo scaffolded, first commit

Ran `docs/hackathon/bootstrap/create-sapore-pay.sh` (prepared and verified green
2026-09-17 in the private repo, deliberately not run before kickoff). Generated the
day-zero skeleton: `packages/{core,tempo,privy,bridge,ens,world,sdk}`, `apps/service`,
`apps/web`, CI, Biome config, MIT licence.

`pnpm install && pnpm build && pnpm test && pnpm lint` — all green on the first run, no
patching needed. 41 files linted clean, 2 tests pass (HMAC webhook signature round-trip),
`apps/web` builds through Vite. The generator earned its keep; that is ~40 minutes of
yak-shaving that did not happen tonight.

Deviation from the runbook, worth noting for honesty: the generator writes a three-line
**placeholder** at `docs/sapore-api-contract.md`, not the real contract. Runbook step 3
says to copy the real one over it from the private repo, which is what happened. Anyone
re-running the generator and skipping step 3 ships judges a stub.

First commit `793d047`, **Fri 25 Sept 21:35 JST**, 50 files. This timestamps the start of
judged work. Nothing in it is Tempo / Privy / World / ENS code — the skeleton is layout,
domain ports, a memo codec and an HMAC signer only, which is the honest starting line.

### 21:40 — blocked: cannot push to the public repo

`git push -u origin main` → **HTTP 403**. The Claude GitHub App is not installed on
`santinocc/sapore-pay`, so this session has read access but not write. The scaffold commit
exists locally with the correct kickoff timestamp and is not at risk, but nothing is
public yet.

Consequences while it lasts, in order of how much they matter:

1. The Continuity Track's proof-of-start is a *public* commit history. A local commit is
   only as good as the push that eventually carries it.
2. ENS requires a **live demo URL** on the showcase. Railway deploys from GitHub, so no
   push means no deploy, and the day-zero stub deploy is the one thing the plan is
   emphatic about not leaving until Sunday.

Fix: install the Claude GitHub App on the repo (or reconnect GitHub) — see the note handed
to Santino. Work that does not depend on it continues meanwhile.

### 21:45 — audit of what the plan assumed was already done

Checked the private repo against the two prep lists before building anything on top of them.

**Present:** the RS256 JWT + JWKS work (`GET /.well-known/jwks.json`, `services/jwtKeys.ts`),
as the plan claims. That is the one Privy custom-auth prerequisite and it is real.

**Absent:** every single one of the "thin glue" endpoints in `sapore-api-contract.md` that
the blueprint listed as *allowed before kickoff*. `grep` over `packages/server/src/routes/`
finds no `/webhooks/pay`, no `/auth/wallet-login`, no `/payments/orders`, no
`/internal/payout/eligible-sales`, no `/internal/payout/mark`, no `/users/me/ens-name`, no
`/users/me/world-id`. None were built.

This is not a disaster — that code is private-side and not judged — but it moves real work
inside the clock. In particular, MVP item 1 (order → pay → webhook → recipe unlocked) cannot
complete without `POST /webhooks/pay` on the Sapore API, and the World nullifier and ENS
name need somewhere to land. Budgeting for it now rather than discovering it at hour 20.

### 21:55 — unblocked, pushed, CI green

GitHub App installed. Four commits pushed to `main`; CI (`pnpm lint && build && test` on
Node 22) is green on both pushes. The repo is public and the kickoff timestamp on `793d047`
survived intact — the block cost about twenty minutes and nothing else.

### 22:05 — Railway deploy config, and a correction to the plan

Committed `railway.service.json` and `railway.web.json` as config-as-code rather than
clicking settings into a dashboard, so the deployment is reviewable and reproducible.

**The obvious configuration is wrong here and it is worth writing down why**, because it is
the kind of thing that eats an hour at 3am. The instinct for a monorepo on Railway is to set
each service's **Root Directory** to `apps/service` and `apps/web`. That is Railway's
*isolated* monorepo pattern, and this is not an isolated monorepo: `apps/service` declares
`"@sapore-pay/core": "workspace:*"`, so a build rooted at `apps/service` never sees
`pnpm-workspace.yaml` and `pnpm install` cannot resolve the link. Both services therefore
build from the repo root with `pnpm -r build`, and `watchPatterns` keeps each from
redeploying on the other's commits. `apps/web` has no workspace dependency *today* and would
survive a per-service root — right up until it takes `@sapore-pay/sdk`, which it will.

`apps/web` is served by `serve -s dist`, moved to `dependencies` rather than
`devDependencies` so a production install keeps it. Both start commands were smoke-tested
locally before committing: `/health` returns `{"status":"ok"}` and the web app returns 200 on
`/` and on an unknown client route (SPA fallback works, which client-side routing will need).

### 22:15 — documentation audit

Swept every planning doc for leftovers from the 2026-09-25 decision to drop the World App
mini app. Four documents still described `apps/mini-app`, MiniKit `pay` and a Developer
Portal mini app listing as live plans — including the public repo's own runbook, whose step 6
said to install `@worldcoin/minikit-js` into a package that does not exist. Corrected, along
with two `sapore.food` hosts that were never set up.

Worth noting as a process observation rather than a complaint: the decision itself was
recorded well (a full ADR in `DECISIONS.md`), but the *consequences* of it were left scattered
across four files. A decision log that does not fan out into the documents it invalidates is
how a team ends up building the thing it already decided not to build.

Also wrote `docs/hackathon/manual-tasks.md` in the private repo — every task needing a human
(World Developer Portal app and `chef-onboarding` action, a Sepolia ENS name, a funded Tempo
Moderato key, Privy, Railway, a World-App-capable phone), ordered by what each one blocks.
None of them had been done at kickoff, and the top three each block a prize outright.

### 22:40 — the marketplace side of `order.paid`

Built the receiving half of the integration in the private Sapore repo, since
it needs no provider credentials and MVP item 1 cannot close without it. Three
commits: extract the fulfilment path, the HMAC trust boundary, the route.

The part worth recording is the refactor, not the route. Sapore's legacy
paste-a-tx-hash flow already contained everything that has to happen when a
recipe is unlocked for money — purchase rows, chef earnings, tier-sales
counters, XP, referral settlement — as one inline block inside
`verifyCryptoCartPayment`. The tempting move is to copy it into the webhook.
That guarantees drift, and drift here is invisible: the symptom is a Chef's
sale quietly not counting toward their rank six weeks later. Extracted instead
into `resolveCartForFulfillment` (read-only, prices the cart) and
`applyCartFulfillment` (every write), split that way because the legacy flow
has to price the cart *before* it verifies the payment while the webhook
arrives already verified.

Design decisions in the route that are not obvious from the code:

- **Idempotency is claimed before fulfilment, not after.** A `PayWebhookDelivery`
  row with a unique key goes in first; a retry arriving mid-flight loses the
  insert race and gets the same 200. Claiming afterwards would leave a window
  where a retry double-credits a Chef.
- **A failed fulfilment deletes its claim.** Otherwise one transient error
  strands the order behind a permanent "duplicate" response.
- **Payout events are rejected with 400, not accepted with 200.** The payout
  engine still lives in the private repo, so there is nothing to do with
  `payout.sent` yet. Answering 200 to an unimplemented money event is how one
  goes missing without anyone noticing.
- **A total mismatch warns but still fulfils.** The payment has already settled
  on-chain; refusing it would strand real money to protect against a cart that
  got cheaper between quote and settlement.

**Friction, environment rather than sponsor:** the 11 route-level tests cannot
run in this session. `mongodb-memory-server` downloads a `mongod` binary at
first run and every MongoDB download host is denied by the environment's
network policy. The 20 signature and payload-parsing unit tests are pure and do
pass locally. The route tests need CI, which is an argument for opening the PR
early rather than at the end.

### 23:05 — CI, and what it caught

Opened `santinocc/sapore#13` on the private repo specifically to get the 11
route tests executed somewhere with a `mongod`. It came back red, which was the
point.

Both failures were in the test file, not the route. The interesting one: two
tests expected 400 and got 401, and **the route was right**. `src/config.ts`
reads `process.env` once at module load, so setting `PAY_WEBHOOK_SECRET` in
`beforeAll` runs after `import { app }` has already frozen the config at `''` —
and an unset secret rejects everything, exactly as designed. The security
property held; the test never armed it. Fixed with a Jest `setupFiles` hook,
which runs before test modules are imported.

Worth keeping as a note on how to work without a local database: both root
causes were still provable here. The config-timing test passes with the hook and
reproduces the CI failure verbatim (`Received: ""`) under `--setupFiles=`, and
the recipe fixture was checked with `RecipeModel.validateSync()`, which needs no
connection. Guessing at a red CI and pushing hopefully is the expensive habit;
finding a way to reproduce locally, even partially, is worth the ten minutes.

Second run: **384 passed, 384 total, 26 suites**. The previous run was 373
passed with 11 failed — same total, so all 11 route tests ran rather than being
skipped, and the 373 pre-existing tests confirm the fulfilment refactor did not
break the legacy paste-a-tx-hash flow. Lint, server build and Docker build green
too.


### Fri 25 Sept — World Developer Portal setup (Santino, live)

Walked Santino through developer.world.org interactively rather than handing
over a static doc — worth doing, because the Portal's flow has moved since the
prep research and a written runbook alone would have stalled on step 2.

**App reused, not created fresh.** Santino already had a "Sapore" app from
earlier setup. Confirmed reusing it is fine — the app's display name is not
part of anything judged; only `WORLD_APP_ID` and the action identifier matter.
No reason to fragment state across two apps.

`WORLD_APP_ID=app_ef4a50bae3f0b2dba0f1058e55bdb0bc`

**Friction, worth carrying into the World integration debrief (requirement 5):**
the Portal now gates action creation behind a **"register relying party"** step
that our prep docs (`stablecoin-rail-research.md`, this repo's own kickoff
notes) never anticipated. They describe the classic flow — call
`POST /api/v2/verify/{app_id}` with just the app id — with no mention of a
relying party or a signer key. The current Portal instead requires:

1. Registering the app as a "relying party" (one-time, blocked action creation
   until done).
2. Configuring a **signer key** — a secp256k1 keypair used to sign proof
   requests. Chose "Generate new key" (Portal-recommended, no existing
   infra needed) over "Use Existing Key" (bring your own public key, e.g. an
   Ethereum address already under your control). The private key was
   downloaded and kept off both repos and this chat.

This is a real architecture difference from what was planned, not a UI
relabeling: the classic app-id-only cloud verify may no longer be the current
API surface, or may coexist with a signed-request path we now have the key
for. **To resolve properly before wiring `createWorldVerifier` for real** —
check World's current docs for whether `/api/v2/verify/{app_id}` still works
standalone or whether the signer key must sign the verification request.
Building against the wrong assumption here is exactly the kind of thing that
costs hours at hour 20 instead of hour 6.

**Action created and confirmed correct:**

```
Identifier: chef-onboarding
Description: Verify you are a unique human before becoming a Chef on Sapore
```

No "max verifications per person" field exists in the Portal UI — confirmed
this is not a missing setting but structural to how Incognito Actions work:
the nullifier hash is deterministic per (person, action) pair, so a second
verification attempt for the same action is either rejected by World's own
endpoint or produces a nullifier we already have on file. Either way, it is
exactly the mechanism the `already_registered` screen in `ChefOnboarding.tsx`
was built to handle — nothing to change there.

World ID setup is now unblocked. Next: confirm the current verify request
shape with real docs before writing `createWorldVerifier`'s implementation.


### Fri 25 Sept, evening — `sapore.eth` live on ENSv2 Sepolia

Registered via a script (`scripts/register-sepolia-ens` in the private repo,
not this one — see the ADR on the crypto/product boundary), because ENSv2
currently has no registration web UI. The "For App Developers" and "ETH
Registrar" docs pages gave the exact commit-reveal shape needed; the only
missing piece was the Sepolia contract addresses, which live in a
"Deployments" table that turned out to be under ENSv2 > Overview, not on the
page that references it three times — worth remembering next time a docs
page cites a table by name without linking it.

```
sapore.eth — ENSv2 Sepolia
owner:  0x0d9f3D27e8F4EEBC80e445a59dAD5A9173d951ab (throwaway key)
tx:     0x544e55dc42d4222d6a6641bb202f492a318cec39896cf06f60fb4cbdb2736260
block:  11780643
```

Ran end-to-end on the first attempt — no fixes needed after the addresses
were in. Registered with **no resolver set**; that's deliberate, not
unfinished. Deploying a Permissioned Resolver and writing `addr(60)` /
`addr(2147487865)` (Tempo, ENSIP-11) / `com.sapore.tier` records is the
actual card-scored work, starting now in `apps/web`.

One thing already confirmed from the docs that matters for what comes next:
the ENS card's "Enhanced Access Control... central, not cosmetic" language
maps onto something real in the protocol, not just our framing of it. The
"Who Can Write" section is explicit that a subname owner (a Chef, in our
case) holds no roles on the parent's resolver by default and gets
`EACUnauthorizedAccountRoles` unless the parent delegates via
`authorize*Roles`. That's exactly the "Chef edits only their own record,
Sapore can revoke" story — it's not a permission model we're grafting onto
ENS, it's the one ENSv2 ships.


### Fri 25 Sept, later — SaporeChefRegistrar contract written (not yet deployed)

Santino provided the "For Contract Developers" ENSv2 guide directly — the
missing piece from `createOnChainSubnameClaimer`'s stub. Wrote
`contracts/subname-registrar/SaporeChefRegistrar.sol` against it, with two
product-driven deviations from the tutorial's default rather than a literal
copy:

- **A narrower role bitmap.** The tutorial's default grants five roles
  including `ROLE_CAN_TRANSFER_ADMIN` — which, per the docs, IS the transfer
  permission itself, not a meta-role. Granting it to Chefs would let them
  sell or trade a verified identity, which is a straight hole in the World
  ID story: a sybil buys a name instead of proving uniqueness. Chefs get
  `ROLE_SET_RESOLVER[_ADMIN]` only. Worth stating in the submission: the
  same "minimum sufficient" argument the World integration makes for its
  credential, made here for a role bitmap.
- **No renewal.** Chef identities are permanent, not a subscription —
  `expiry = type(uint64).max`, one less role to grant at deployment.

Also resolved, in conversation rather than in docs: whether Cookers and
Chefs should have separate wallets, and whether Cookers should get their own
ENS subnamespace (`<alias>.cooker.sapore.eth`). Decided against both — one
Privy wallet per person for both roles (a Chef's payout wallet is a
destination, not a treasury; the batch payout job already holds funds in
escrow, so there's no real security reason to split), and no ENS name for
Cookers at all (nobody looks up a Cooker by name; manufacturing one would be
the exact over-application the World card penalizes, applied to ENS
instead).

**Not deployed.** Two real blockers, not busywork: deploying this needs a
UserRegistry proxy via the Verifiable Factory, and the guide for that
("Deploying a Registry Proxy") hasn't been fetched — same network
restriction that blocks this session from reaching docs.ens.domains
directly. And Foundry isn't installed in this sandbox and can't be (same
restriction), so the contract has not been compiled, only written to match
the tutorial's interfaces exactly. Those are different claims; only the
second is still unverified.


### Thu 25 Sept, later still — deploy scripts run; resolver revert diagnosed and fixed

Ran `01-deploy-user-registry.mjs` against Sepolia — succeeded first try.
`UserRegistry` proxy: `0x9a932e911c7FD7DfD54d1B11Ef4fE0c9aa46862d`, connected
into `sapore.eth`'s hierarchy via `setSubregistry()`.

`02-deploy-shared-resolver.mjs` reverted with no reason string. Diagnosed by
adding `simulateContract`/`getBytecode` checks and decoding the raw revert
calldata by hand — the calldata matched intent exactly, so the revert had to
be inside the resolver's own `initialize()` logic, not a wiring bug.
Suspected the `ALL_ROLES` constant: it was copied verbatim from the
Verifiable Factory doc's generic "every 4th bit" example
(`0x1111...1111`), which happens to work for `UserRegistry` (step 1) but not
for the Permissioned Resolver, whose actual roles occupy specific,
non-contiguous bits (0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 124, each with an
admin variant at `+128`) per the "Permissioned Resolver" doc's own "EAC
Integration" table. Confirmed once Santino supplied that doc: the blanket
bitmap set bits (40, 44, 48, ... 120) the resolver doesn't define at all,
which is almost certainly what `initialize()` was rejecting. Replaced it
with a bitmap built only from the resolver's real roles. Not yet re-run
against Sepolia — the fix is confirmed syntactically sound (dry-run against
a throwaway key fails only at the RPC boundary, no code error) but the
actual on-chain call is still unverified.

Also wrote `03-authorize-chef.mjs`, the piece both `02`'s comments and this
log's previous entry flagged as missing: delegating a *specific* Chef write
access to *only* their own name, using `authorizeNameRoles` per the doc's
"Delegating a Single Text Key" example (DNS-encoded name via
`toHex(packetToBytes(name))`, not a namehash — the one detail in that
example that doesn't match the rest of this codebase's namehash-based
calls). Granted roles are just `ROLE_SET_ADDR | ROLE_SET_TEXT` — the two
record types `writeChefRecords()` actually writes — same "minimum
sufficient" reasoning as the World credential and the registrar's own role
bitmap, applied a third time.


### Thu 25 Sept, later still (correction) — the role-bitmap fix wasn't the real fix

Santino re-ran `02-deploy-shared-resolver.mjs` with the bitmap fix applied —
same revert, zero revert data, same `raw: '0x'`. Decoded the new calldata by
hand again: it round-trips to exactly the intended `RESOLVER_ALL_ROLES`
value, so the bitmap fix was correctly applied but didn't fix anything.

Santino then pasted the *entire* "Permissioned Resolver" page, including the
"Reference" section that the previous partial paste (EAC Integration + Code
Examples only) never reached. Two things fell out of reading it in full:

1. **The `initialize(admin, roleBitmap, setters)` signature was right all
   along** — the Reference section's own Write Functions list confirms it
   verbatim, selector included (`toFunctionSelector` on the signature
   produces `0x7058b559`, matching every revert's calldata exactly). Not a
   guess that happened to work; a guess that turned out correct, confirmed
   after the fact — worth being honest about the distinction.
2. **The doc's own "Deploying a Resolver Proxy" worked example** (which,
   it turns out, exists on the *Verifiable Factory* page, not the resolver
   page — already read earlier in the session, its resolver-specific example
   just hadn't been connected to this bug yet) uses the exact same blanket
   `ALL_ROLES = 0x1111...1111` this script started with, the exact same
   salt scheme, the exact same call shape. Our original code was already a
   byte-for-byte match of the reference implementation. The role-bitmap
   "fix" from earlier today was real (narrower is still strictly better
   practice) but not a fix for this revert — the revert survives even the
   doc's own canonical example.

So the cause is something the calldata can't reveal: a mundane wrong-address
possibility (added a direct `recordVersions()` read on
`PERMISSIONED_RESOLVER_IMPL` to rule that out cheaply), or a CREATE2
collision at the resolver's address, which is fully determined by
`(owner, version)`. Worth stating plainly: this repo's throwaway
`ENS_OWNER_PRIVATE_KEY` has been pasted in this chat and should be treated
as compromised — if anyone else used it to deploy anything at that exact
predictable address, this call would revert on the collision with exactly
this symptom. Added `ENS_RESOLVER_SALT_VERSION` as an env override so
Santino can test a fresh address directly rather than guess further.


### Thu 25 Sept, later still (the actual fix) — initialize() only takes two arguments

Santino tried `ENS_RESOLVER_SALT_VERSION=1` — different salt, different
proxy address, identical zero-data revert. That ruled out the collision
theory: whatever's wrong is not address-specific, it's systematic.

At that point every diagnostic available from calldata and docs alone was
exhausted, so the next step was reading the actual deployed source instead
of inferring it — both `VerifiableFactory` and `PermissionedResolverImpl`
are verified on Sepolia Etherscan. Santino found `PermissionedResolver.sol`
in the file tree and pasted the real `initialize`:

```solidity
function initialize(address admin, uint256 roleBitmap) external initializer {
    if (admin == address(0)) revert InvalidOwner();
    __UUPSUpgradeable_init();
    _grantRoles(ROOT_RESOURCE, roleBitmap, admin, false);
}
```

Two arguments, not three. Every version of this script — including the
doc's own "Deploying a Resolver Proxy" example, which we'd matched
byte-for-byte — encoded a call to `initialize(address,uint256,bytes[])`, a
function that doesn't exist on the deployed contract. Selector
`0x7058b559` (3-arg) vs. the real `0xcd6dc687` (2-arg) — the delegatecall
never matched anything, hence the empty revert data every single time,
regardless of which roleBitmap or which salt we tried. Both of those were
red herrings chased down a wrong assumption, not actual causes.

**Why the docs were wrong**: the "Permissioned Resolver" page itself says
"The contracts and interfaces described here are not yet final and may
change prior to mainnet deployment" — this is exactly that. The Verifiable
Factory doc's "Deploying a Resolver Proxy" example matches the *documented*
interface, which had already drifted from the *deployed* one by the time we
tested it against Sepolia. Three rounds of guessing (bitmap, then CREATE2
collision) were spent on a premise — "the docs describe what's deployed" —
that doesn't hold for pre-mainnet contracts. Verified source on the block
explorer is ground truth here in a way the docs currently aren't; worth
checking it earlier next time a revert survives a byte-for-byte match with
documented examples.

Fixed `02-deploy-shared-resolver.mjs` to call the real 2-arg `initialize`.
No functional loss: the removed `setters` parameter would only have bundled
initial record-setting into the same transaction, and
`writeChefRecords()` in `apps/web` already writes records as a separate
call regardless. Not yet re-run against Sepolia.


### Thu 25 Sept, later still — shared resolver deployed

`02-deploy-shared-resolver.mjs` ran clean on the first try after the
2-argument fix. Confirms the diagnosis was actually right this time, not
just another plausible-looking dead end.

```
Shared Permissioned Resolver — ENSv2 Sepolia
address: 0x0356d23bcfBe2Cb42508542c930C7A2cCa352858
admin:   0x0d9f3D27e8F4EEBC80e445a59dAD5A9173d951ab (same throwaway key as sapore.eth)
tx:      0xcb1a8fc941d6b668363e7b1d37030fb28773390dc1e60ca589b60f976e5ef45e
```

Next: `SaporeChefRegistrar.sol` via Foundry (step 3), then authorize it on
`UserRegistry` (step 4), then a real Chef registration to exercise steps 5-6
(`isAvailable`/`register`/`03-authorize-chef.mjs`) end to end.


### Thu 25 Sept, later still — first real Foundry compile, and a caught access-control gap

`forge build` compiled clean once Foundry was actually installed
(`foundryup`) — but the very first attempt failed on `@notice` used on a
file-level (free) variable, which Solidity's NatSpec rules don't allow
(only `@dev` is valid there). One-line fix.

The second `forge build` succeeded with two lint warnings, both real:
- `missing-zero-check` on the constructor's `beneficiary` param — added a
  guard, since it's immutable and a zero mistake would be permanent.
- `reentrancy-events` on emitting `ChefNameRegistered` after
  `REGISTRY.register()` — accepted as-is (documented inline) since the
  event's `tokenId` only exists after that call returns, and the call is
  register()'s own trusted parent contract, not attacker-controlled.

While writing that second comment, re-reading `register()` turned up
something forge's linter didn't flag but should have been obvious on
review: **the function had no access control at all.** The doc comments
claimed "only Sapore's backend (holding ROLE_REGISTRAR) can call
register()" — true of who can call the *underlying* `UserRegistry.register()`
(restricted to ROLE_REGISTRAR holders, which this contract will hold once
step 4 runs), but `SaporeChefRegistrar.register()` itself had zero
restriction on `msg.sender`. Anyone could have called it directly, for any
label, for any owner, for free, completely bypassing the World ID check the
whole product design assumes happens before this contract is ever reached.

Fixed before anything was deployed (constructor args are immutable, so this
had to be caught now or never): added a `BACKEND` immutable address and an
`Unauthorized()` revert in `register()`. Constructor now takes a 5th arg;
`sapore.eth`'s admin key is used for it in this deployment since that's what
Sapore's backend controls throughout the event, though a production
deployment would want a dedicated backend signer with a narrower blast
radius than the account that also owns `sapore.eth` and the shared resolver.

Not yet re-run through `forge build` after this change or deployed.


### Thu 25 Sept, later still — SaporeChefRegistrar deployed

`forge create` succeeded after the access-control fix and a re-`forge build`
(clean except the accepted reentrancy-events warning).

```
SaporeChefRegistrar — ENSv2 Sepolia
address: 0x45347E1a412a16f494d945Ed3402A773A07fc5D1
tx:      0x5080ac0f18f586fc38ed376ef74348090f0195d5ff17a6228766a04f4f058feb
constructor args: registry=0x9a932e911c7FD7DfD54d1B11Ef4fE0c9aa46862d,
  paymentToken=0xBA11ebdB3f9a2c5946D8629517f06364E53A2E10 (MockUSDC),
  beneficiary=backend=0x0d9f3D27e8F4EEBC80e445a59dAD5A9173d951ab (sapore.eth's admin key), price=0
```

Before granting it `ROLE_REGISTRAR` (step 4), checked `grantRootRoles` and
`ROLE_REGISTRAR`'s bit value against verified Sepolia source
(`EnhancedAccessControl.sol`, `IEnhancedAccessControl.sol`,
`RegistryRolesLib.sol`) rather than trust the README's existing snippet —
both turned out correct as documented, unlike the resolver's `initialize()`.
Wrote `04-authorize-registrar.mjs` (matching the pattern of scripts 01-03)
to replace the README's bare TypeScript snippet with something actually
runnable; dry-run tested, not yet run against Sepolia.


### Thu 25 Sept, later still — registrar authorized, register-chef script added

`04-authorize-registrar.mjs` ran clean: `SaporeChefRegistrar`
(`0x45347E1a412a16f494d945Ed3402A773A07fc5D1`) now holds `ROLE_REGISTRAR` on
`UserRegistry`, tx `0xa232aca1c72e8e52689813c566ed12f0e6c6686bb34e93850b8ac13e795c89a9`.

Wrote `05-register-chef.mjs` for step 5 — the first script in this whole
deploy sequence whose ABI didn't need any doc/Etherscan verification, since
`SaporeChefRegistrar.sol` is our own source, compiled and deployed from this
repo. Checks `isAvailable`, calls `register()`, parses the
`ChefNameRegistered` event for the minted `tokenId`. Dry-run tested, not yet
run against Sepolia — that run is what finally exercises the entire
pipeline (registry → resolver → registrar → a real Chef name → delegated
write access via 03-authorize-chef.mjs) end to end for the first time.


### Thu 25 Sept, later still — first Chef registered, pipeline verified end to end

`05-register-chef.mjs` ran clean on the first try:

```
marco.sapore.eth — ENSv2 Sepolia
tokenId: 38611655076938727590367281247710421354087380433560551197690241304350467031040
tx:      0xc934cce82a7178413fec43ba981ec065e352194ff81eaf4a922e491f96d85cce
```

Registry → shared resolver → registrar → a real Chef subname, all real,
all on Sepolia. Only step 6 (delegating `marco`'s own write access via
`03-authorize-chef.mjs`) is left to close the loop.


### Thu 25 Sept, later still — full pipeline verified end to end

`03-authorize-chef.mjs` ran clean: `0x0d9f3D27e8F4EEBC80e445a59dAD5A9173d951ab`
can now call `setAddr`/`setText` for `marco.sapore.eth` only, tx
`0x67f2a8e05dd8223f547eaccdd6cf9c0179a662921e06b43533e49b1502e1c837`.

All six steps in `contracts/subname-registrar/README.md` have now run
successfully against Sepolia, in order, with no simulated stand-ins:
UserRegistry deployed → shared resolver deployed → SaporeChefRegistrar
deployed → authorized with ROLE_REGISTRAR → a real Chef (`marco.sapore.eth`)
registered → that Chef's write access delegated. Three real bugs were found
and fixed along the way (an invalid role bitmap that turned out not to be
the actual problem, a resolver `initialize()` argument-count mismatch that
was, and a missing access-control check in `register()`), all documented
above as they happened rather than cleaned up after the fact.

Not yet done: wiring `apps/web`'s `createOnChainSubnameClaimer` (still an
honest stub) to `SaporeChefRegistrar`, and `createOnChainRecordWriter` to
actually call `writeChefRecords()` against `marco.sapore.eth`'s resolver
now that write access is delegated — both are real product code changes
left for the PR or a follow-up, not deploy-script work.


### Thu 25 Sept, later still — apps/web wired to the deployed contracts

Added a "Real (Sepolia)" mode to the ENS-claim and payout-records demo
steps, backed by three new apps/service routes (`GET
/ens/chef/:label/availability`, `POST /ens/chef/claim`, `POST
/ens/chef/records`). Backend-mediated rather than client-side by
necessity, not choice: `SaporeChefRegistrar.register()` only accepts calls
from the address deployed as `backend`, and that key can never ship to the
browser.

Decided against building Privy embedded wallets in the same pass — a
materially larger, separate integration (wallet creation/login UX, session
handling, a signing flow) — in favor of shipping the real on-chain wiring
now and sequencing Privy as the next task. Structured so nothing here needs
rework when Privy lands: `writeChefRecords()` moved out of `apps/web` into
the shared `@sapore-pay/ens` package (`packages/ens/src/chefRecords.ts`),
so `apps/service` (today) and `apps/web` (once a Chef's own wallet client
exists) call the exact same function — only `recordWriter.ts`'s
implementation swaps from "call the backend" to "call it directly."

`apps/web`'s `ensRecords.ts` is now a thin re-export of the relocated
package. All builds (`tsc`, `vite build`) and existing test suites (20 + 2
tests) pass; Biome lint is clean. Not yet click-tested against a running
`apps/service` in this session — that and Privy are the two things left
before this feature branch is fully closed out.


### Thu 25 Sept, later still — Privy embedded wallets

New branch, `feat/privy-embedded-wallet`, off `main` after both prior PRs
landed (see the correction two entries up — PR #3 merged early, PR #4
carried everything that came after it).

Before writing anything, checked `docs/sapore-api-contract.md` and
`packages/privy`'s own scaffold comment, since both already describe how
Privy is meant to fit into the real product: a SIWE handoff
(`POST /auth/wallet-login`) to a Sapore account, or Privy's "custom auth"
trusting an existing Sapore login. Both presume a Sapore login this
isolated demo (`apps/web`) doesn't have, and the API contract marks that
endpoint "thin glue; not judged" — it lives in the private repo, out of
this repo's scope. Decided (confirmed with Santino) to use Privy's own
standalone login instead, scoped to what this demo needs: a real wallet
that can sign real transactions. The full account-linking story is
deferred to whenever the private repo's side of it gets built, on its own
timeline.

Checked Privy's actual installed type declarations before writing any
usage code, same discipline as the ENSv2 contract work — `getEthereumProvider(): Promise<EIP1193Provider>`
on `ConnectedWallet`, `getEmbeddedConnectedWallet()` to find the Privy
wallet specifically, and confirmed `Chain` (from `@privy-io/chains`) is
structurally a plain viem chain object — `sepolia` from `viem/chains`
passes straight through, per the package's own doc example.

Built:
- `apps/web/src/lib/privyWallet.ts` — `useChefWallet()`, wrapping Privy's
  auth/wallet state into a `ChefWalletState` discriminated union (loading /
  logged_out / no_embedded_wallet / ready / error) and building a viem
  `WalletClient` from the embedded wallet's EIP-1193 provider once ready.
- `apps/web/src/screens/WalletConnect.tsx` — same "every outcome is a
  designed screen, transitions are explicit buttons" pattern as
  ChefOnboarding/EnsClaim, including not auto-advancing once the wallet is
  ready.
- `createPrivyRecordWriter()` in `recordWriter.ts` — calls the same
  `writeChefRecords()` from `@sapore-pay/ens` directly with the Chef's own
  wallet, no backend involved. `createOnChainRecordWriter()` (backend-
  signed) stays too — still real, still useful when no wallet is connected.
- Wired into `App.tsx`: the wallet gate only appears when "Real (Sepolia)"
  mode is selected for the ENS-claim or payout steps, since the simulated
  paths never touch a real address at all. Claiming stays backend-signed
  regardless (`register()` only accepts calls from its deployed `backend`
  address) — the wallet's job there is supplying the real `ownerAddress`,
  not signing the registration itself.

`VITE_PRIVY_APP_ID` isn't set yet — that's the one manual step left (create
an app at dashboard.privy.io, enable email login + embedded wallets),
same shape as `WORLD_APP_ID`'s. Until then, `WalletConnect` reports "not
configured" rather than crashing. `tsc`, `vite build`, and the existing
20-test suite all pass; Biome lint is clean. Not yet click-tested against a
real Privy app id (needs that manual step first).


### Thu 25 Sept, later still — a real cross-platform build gap in packages/core

Santino hit `pnpm build` failing on `packages/core` with "Cannot find name
'TextEncoder'" / "'TextDecoder'" on his machine (macOS, Node 20 then 22),
even after `nvm use 22`, Corepack reinstalling pnpm, and a full clean
`node_modules` wipe + reinstall. None of those fixed it. Reproduced the
exact same clean-wipe + `pnpm build` in this sandbox (Linux) against the
identical lockfile — it built fine every time.

Root cause: `packages/core/src/memo.ts` uses `TextEncoder`/`TextDecoder`,
but `packages/core` never declared `@types/node` as its own dependency —
it only had those globals typed by accident, via TypeScript's automatic
`@types/*` discovery picking up `@types/node` hoisted transitively through
`vitest` (which depends on it). That kind of implicit, hoisting-dependent
resolution is exactly the sort of thing that can differ between package
managers, OS, or even just install order, without the lockfile itself
changing — which fits both machines resolving the *same* lockfile but
disagreeing on whether those types were visible.

Fixed properly rather than chasing the platform difference further: added
`@types/node` as an explicit `packages/core` devDependency (same version
range as `apps/service` already uses). No other `packages/*` reference
Node/Web-standard globals directly, so none of them were exposed to this.
`pnpm build`, `pnpm -r test`, and Biome all pass clean after the fix.


### Thu 25 Sept, later still — first real click-through found two real bugs

Santino ran the actual "Real (Sepolia)" flow end to end for the first
time: World ID (simulated) → wallet gate → real Privy email OTP → a real
embedded wallet ("Wallet ready") → back to the claim form. Confirms the
whole Privy wiring works — real modal, real login, real wallet, exactly
the order intended (World ID, then wallet, then the ENS step that needs
it).

Two real bugs found along the way, both fixed:

1. **Stuck forever on "Checking availability."** `EnsClaim.tsx`'s
   `submit()` had no error handling at all. `createOnChainSubnameClaimer`'s
   `isAvailable()` returns a plain boolean with no error channel, so when
   `apps/service` wasn't running (never started in this test), the
   underlying `fetch` rejected, threw uncaught out of `submit()`, and left
   the component sitting in `{kind: 'checking'}` forever — no further
   `setPhase` call was ever going to run. Wrapped the whole function body
   in try/catch, mapping any thrown error to the existing `failed` /
   `error` outcome. Applied the same defensive wrap to `PayoutRecords.tsx`,
   since `writeChefRecords()` also has an unguarded `normalize()`/
   `namehash()` call before its own internal try/catch.
2. **"Asking for the ENS name again."** Toggling Simulated ↔ Real
   remounted `EnsClaim`/`PayoutRecords` from scratch (their `key` included
   `claimMode`/`recordMode`), wiping anything already typed. A real Chef
   would only ever be in one mode for their whole session, so this never
   would have surfaced outside of demo-testing both modes back to back —
   but it's still a real rough edge worth fixing for judges doing exactly
   that. Dropped `claimMode`/`recordMode` from the key; `claimScenario`/
   `recordScenario` + the run counters still force a fresh run for
   explicit scenario-chip clicks.

Also discussed, not built: Santino's instinct that Privy wallet creation
should happen at signup — before choosing Cooker or Chef, one OTP not
two — is correct and already the documented direction, not a new idea.
`packages/privy`'s own scaffold plans exactly this via Privy's "custom
auth" (an existing Sapore session token becomes the credential Privy
trusts, so wallet creation rides on the same login rather than a separate
one), and the "one Privy wallet per person, for both roles" decision is
already logged (see the 25 Sept entry on wallet/ENS-namespace design).
The two-OTP feel in this demo is specific to the standalone-Privy-login
scope decision made for this isolated demo (no Cooker signup flow exists
here to attach wallet creation to, and the real unification needs the
private repo's auth system) — not a flaw to fix in this repo's narrow
judged surface. Logged here as the confirmed direction for whenever that
work starts, rather than built now.


### Thu 25 Sept, later still — reconciled the signup/login design: wallet-login only

Following up on the two-OTP discussion: Santino pushed further and asked
the sharper question directly — for a crypto-only app, is a separate
email+password+OTP signup step ever justified at all, versus just making
Privy's wallet login *be* the signup, for both Cooker and Chef? Agreed:
no, it isn't. Privy's email-OTP login already proves email control,
creates identity, and creates the wallet in one step; a Sapore-specific
credential system in front of that would prove the same thing twice for
no benefit.

Traced why the docs suggested otherwise: `docs/sapore-api-contract.md`'s
auth section listed `POST /auth/login`/`/auth/signup`/`/auth/oauth`
(password-based) as the primary path and `/auth/wallet-login` (SIWE,
already Privy-shaped) as a secondary addition. That ordering reads like
inheritance from Chefini's fiat/card-based fork ancestry rather than a
deliberate crypto-only design — Chefini needs password auth for its
Stripe-billed identity; Sapore doesn't.

Updated `docs/sapore-api-contract.md`: `/auth/wallet-login` is now
documented as the only auth path, handling signup and login identically
(creates the `User` row on first sight of a wallet address, links to it
otherwise) — no separate account-creation step, no password field. The
password-based endpoints stay documented (they're still what's actually
deployed) but marked legacy, same treatment as the already-deprecated
crypto payment flow. Also flagged `PATCH /users/me/wallet` as likely
redundant once this lands, since the "one wallet per person, both roles"
decision means the login wallet and payout wallet are the same address by
default.

Also fixed `packages/privy/src/index.ts`'s scaffold comment, which
planned the *reverse* direction (Privy verifying Sapore's tokens via
"custom auth", presuming Sapore had its own login worth trusting) — kept
as documented history, with the corrected direction (Sapore verifies
Privy's SIWE signature, not the other way around) stated clearly above
it.

Scope note: the actual implementation is private-repo work
(`packages/server/src/routes/auth.ts` there), out of what this repo is
judged on. This update keeps the two repos' shared understanding
accurate ahead of that work, rather than building it now.


### Fri 26 Sept, early — CORS was the actual blocker on the first real claim attempt

Santino got apps/service running and tried a real claim ("pepe") — got
"Failed to fetch" instead of a hang (confirming yesterday's error-handling
fix works), but the claim itself still couldn't reach the service.
Browser CORS, not a real network failure: apps/web (Vite, auto-incremented
to port 5174 since 5173 was taken) calling apps/service (port 4000)
cross-origin, and Express had zero CORS configuration — the browser blocks
the request before it reaches the service at all, which is also why the
only detail `fetch` gives is the generic "Failed to fetch."

Added the `cors` package, a `WEB_ORIGIN` config entry (comma-separated,
defaults to localhost:5173-5175 to cover Vite's auto-increment behavior),
and wired it into app.ts.

While in there, added an honest comment on both `/ens/chef/claim` and
`/ens/chef/records`: neither has any authentication yet. Anyone who can
reach the service can register any available alias to any address for
free, or write payout records for any name (the backend key holds
ROOT_RESOURCE roles on the resolver). CORS was never protection against
this — it only stops browser JS from other origins, not direct API calls.
Real gating needs the wallet-login session design just reconciled in
docs/sapore-api-contract.md (caller must be World ID verified and own
`ownerAddress`) — real scope, not fixed here, flagged rather than hidden.


### Fri 26 Sept, early — apps/service never actually loaded .env

Right after the CORS fix, Santino got a step further and hit a real
config error: "ENS backend is not configured on this deployment" —
despite having added `ENS_BACKEND_PRIVATE_KEY` to `apps/service/.env`
earlier. Root cause: `apps/service/src/index.ts` never loaded `.env` files
at all. Unlike the deploy scripts (each of which explicitly does
`import 'dotenv/config'`), `index.ts` just read `process.env` directly via
`loadConfig()`, and plain Node doesn't auto-load `.env` — the file sat
there, correctly filled in, never read by anything.

Added `dotenv` as a dependency and `import 'dotenv/config'` to the top of
`index.ts`, matching the pattern the deploy scripts already use. Verified
directly in this sandbox with a real `.env` and a live `curl` against
`/ens/chef/:label/availability`: the service now genuinely attempts a real
`isAvailable()` call against Sepolia — it fails here only on this
sandbox's own network egress allowlist (`ethereum-sepolia-rpc.publicnode.com`
not permitted), which doesn't apply to a normal machine with real
internet access. `pnpm build` and Biome both clean.

### Fri 26 Sept — first real end-to-end ENS claim, on Santino's machine

After pulling `018d657` and restarting `apps/service`, Santino claimed
`jose.sapore.eth` in "Real (Sepolia)" mode through the actual browser UI —
World ID step → Privy embedded wallet already connected → ENS claim called
the live `apps/service` → `SaporeChefRegistrar.register()` on Sepolia →
delegated write access, same as the scripted `05-register-chef.mjs` run,
but this time driven entirely from the product UI with a Privy-created
wallet address instead of a manually-funded deploy-script key. UI correctly
landed on "CLAIMED — jose.sapore.eth is yours" and moved to the payout-address
step. This is the first real proof the CORS + dotenv fixes actually unblock
the intended flow outside the sandbox, not just via curl.

Next to exercise for the first time: `createPrivyRecordWriter` — the Chef's
own connected Privy wallet signing `writeChefRecords()` directly, via the
"Set payout address" step now showing on screen.

### Fri 26 Sept — WalletConnect's "Continue" button was mislabeled on the payout step

Santino's browser closed mid-session; he reopened `localhost:5174`, redid
World ID + claimed a fresh alias (`mario.sapore.eth`, simulated mode this
time), then switched the Payout step to Real (Sepolia). Privy correctly
restored his existing session with no re-login needed — but the resulting
"Wallet ready / You're signed in" screen said "Continue to claim your name
→", which is wrong on the payout step; claiming was already done.

Root cause: `WalletConnect` is shared between the claim step and the
payout step (`App.tsx`'s single `needsWallet` flag covers both), but its
`Ready` screen hardcoded the claim-step's button text with no way for the
caller to say which step actually asked for the wallet. Fixed by adding a
`continueLabel` prop to `WalletConnect`/`Ready`, and having `App.tsx` pass
"Continue to set payout address" when `recordNeedsWallet` is what
triggered the gate, "Continue to claim your name" otherwise. `pnpm build`
and Biome both clean.

### Fri 26 Sept — payout address field never prefilled the connected wallet

Right after the button-label fix, Santino asked a sharp UX question about
the payout step: "isn't that address supposed to be what I just got
through Privy? Why do I need to type it again?" Good catch — real
inconsistency, not a misunderstanding. `EnsClaim` already resolves
`ownerAddress` from `chefWallet.address` automatically in real mode (the
Chef never types their own address for the claim), but `PayoutRecords`
always started its input state at `''`, regardless of whether a wallet was
already connected.

Fixed by threading a `defaultAddress` prop from `App.tsx` (`chefWallet.address`
in real mode, empty otherwise) into `PayoutRecords`'s initial `Phase.address`.
Deliberately kept it editable rather than locking the field — paying out to
a wallet other than the one you're logged in with is a legitimate case
(e.g. a cold wallet for payouts, hot wallet for login), so prefill-but-
overridable is the right default, not force-same-address. `pnpm build` and
Biome both clean.
