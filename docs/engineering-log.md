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
