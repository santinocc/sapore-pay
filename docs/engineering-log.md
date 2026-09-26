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

### Fri 26 Sept — walked back "prefill but overridable"; locked it instead

Santino pushed back on the previous entry's call: for Sapore Pay
specifically, the embedded Privy wallet *is* the point — the ENS name is
tied to it, the claim was signed by it, and letting someone retype a
different payout address undermines exactly what the wallet-tied name is
for. He's right, and it matches what `docs/sapore-api-contract.md` already
settled on (login wallet = payout wallet by design) — the "editable
override" reasoning in the previous entry didn't actually fit this app.

Changed `PayoutRecords` so a connected wallet's address renders as a fixed
`<p className="ec-mono">`, not an `<input>` — same treatment `EnsClaim`
already gives the owner address (never shown as editable there either).
Simulated mode (`defaultAddress === ''`, no real wallet to fix it to)
keeps the free-text input, since it's only exercising demo scenarios, not
a real address. `pnpm build` and Biome both clean.

### Fri 26 Sept — ENS name, not the raw address, is the identity once claimed

Santino proposed a broader identity rule: before a Chef claims a name, the
raw Privy address is all there is, so it's fine to show it. Once
`<alias>.sapore.eth` exists, though, that name — not the `0x...` address
underneath it — should be what the product shows as "you" everywhere;
the raw address becomes a small, copyable secondary detail, not the
headline.

`EnsClaim`'s own "Claimed" screen already worked this way (leads with
`{fullName} is yours`, no address shown at all). Two other screens didn't:

- `WalletConnect`'s "Ready" card, reused as the wallet gate ahead of the
  Payout step, only ever showed the raw address ("You're signed in" +
  `0x0b2a...a6a2`) — it had no way to know a name had already been
  claimed by that point in the flow.
- `PayoutRecords`'s locked address display (added earlier today) showed
  the full untruncated `0x...` value in a bordered box — technically
  correct but visually competing with the ENS name already in the H1
  above it.

Fixed both: `WalletConnect` takes an optional `chefName` prop — when
`App.tsx` passes the already-claimed `fullName` (only possible once
`step.kind === 'payout'`; there's nothing to pass before a name exists),
the card reads "Signed in as `<name>`" with the address shrunk to a
shortened, `title`-attributed secondary line, matching its existing
`.wc-mono` (small, faint) styling. `PayoutRecords`'s locked value moved
from `.ec-mono` (bordered box, full address) to `.ec-mono-inline`
(shortened, same treatment `addr(60)` already gets inline in the copy
above it) for the same reason. `pnpm build` and Biome both clean.

### Fri 26 Sept — payout heading shouldn't ask a question it already answered

Santino pointed out that once the address is locked, "Where should
mario.sapore.eth get paid?" is the wrong register — nothing is being
asked, since there's no choice left to make. Changed the H1 to a
statement in the locked case ("You'll get paid to your mario.sapore.eth
wallet"), dropped the now-redundant explanatory paragraph underneath it
(the statement already says what that paragraph was there to clarify),
and kept the original question form for Simulated mode, where typing an
address is still a real choice being made. `pnpm build` and Biome both
clean.

### Fri 26 Sept — a "no resolver" error that wasn't a bug, and the real fix that followed

Santino hit "maria.sapore.eth has no resolver yet" and it looked like a
regression. It wasn't: `writeChefRecords()` does a genuine
`publicClient.getEnsResolver({ name })` lookup against Sepolia, and it
correctly found nothing, because the Claim step was still in its default
Simulated mode while Payout had been switched to Real — `maria.sapore.eth`
was never actually registered on-chain, so there was no real resolver to
find. Confirmed by reading `writeChefRecords` in `packages/ens/src/chefRecords.ts`
rather than guessing.

That surfaced a real, separate complaint: the Real-mode journey had three
clicks past picking an alias — a "Continue" on the wallet-ready screen, a
"Set payout address →" on the claim-confirmation screen, and "Set payout
address" on the payout screen itself — none of which represented an actual
new decision once the wallet was already connected and its address already
locked in. Fixed all three, but only for the Real-mode path, since
Simulated mode's scenario chips (Taken / Unauthorized / No resolver / Tx
error) are how ETHGlobal judges see every rejection state on demand and
depend on Claim and Payout staying separate, clickable steps there:

- `WalletConnect`'s `Ready` screen no longer waits for a click — once
  Privy reports the wallet is actually ready, it auto-continues after a
  ~700ms beat (long enough to read "Signed in as X", short enough not to
  feel like a stall). Every other state (logged out, needs a wallet,
  errored) still waits on an explicit action.
- `EnsClaim` takes a new `autoAdvance` prop. When true, its "Claimed"
  screen skips the "Set payout address →" click and moves on after ~900ms
  on its own; when false (Simulated, or Real-only-for-claim), the manual
  button and full explanatory copy stay exactly as before.
- `PayoutRecords` takes a new `autoSubmit` prop. When true and the address
  is locked, it fires the write itself on mount instead of waiting for a
  button press — Privy's own signature prompt is the real checkpoint here,
  not an extra click of ours in front of it. A failed auto-submit falls
  back to the manual button rather than silently retrying an on-chain
  write.
- `App.tsx` computes `autoMerge = claimMode === 'real' && recordMode ===
  'real'` and only sets `autoAdvance`/`autoSubmit` when both are real —
  the actual "just do this for real" path, not a change to how Simulated
  behaves.
- Since the claim-confirmation screen (with its own tx hash) now gets
  skipped in the merged path, threaded `claimTxHash` through `Step` ->
  `PayoutRecords`, so the one screen left at the end shows both the name
  claim's tx and the payout's tx, not just the second one.

Net result in the fully-real path: type an alias, click "Check & claim"
once, approve one Privy signature when it appears — everything else
(wallet confirmation, the claim-to-payout handoff, firing the payout
write) happens without another click. `pnpm build` and Biome both clean
(Biome's own `useExhaustiveDependencies` suppression syntax needed
`biome-ignore` comments directly above each `useEffect`, not the
`eslint-disable-next-line` form used at first — different linter,
different comment).

### Fri 26 Sept — the wallet screen looked stuck after removing its button

Santino tried the merged Real+Real flow and the wallet-ready screen just
sat there with no alias input appearing — reasonably read as broken, since
its only remaining control was a "Not you?" logout button with nothing
suggesting anything was about to happen.

Two real issues, not one:

1. **A genuine bug in `useChefWallet`** (`apps/web/src/lib/privyWallet.ts`):
   its effect depended on `wallets`, the raw array Privy's `useWallets()`
   returns — which gets a new array reference most renders even when its
   contents haven't changed. That re-ran the whole effect continuously,
   re-fetching the embedded wallet's provider and rebuilding a brand new
   `WalletClient`/`PublicClient` pair over and over, long after the wallet
   was already ready. Not confirmed as the actual cause of the "stuck"
   report (the auto-advance timer set on `Ready`'s first mount should
   still fire regardless, since the effect's own deps are `[]`), but it's
   wasteful and a real bug on inspection either way. Fixed by keying the
   effect on `embedded?.address` — a stable primitive — instead of the
   array itself.
2. **No visual cue that anything was happening.** Removing the manual
   "Continue" button (the whole point of the earlier auto-continue fix)
   left a static card indistinguishable from an actually-broken one.
   Added a plain "Continuing automatically…" line so the ~700ms wait
   reads as a deliberate pause, not a hang.

`pnpm build` and Biome both clean.

### Fri 26 Sept — the wallet screen really was stuck: a StrictMode + ref-guard interaction

Santino tested again after the previous entry's fixes and it was still
stuck — now clearly showing "Continuing automatically…" and never
continuing, well past 700ms. Not a timing issue after all.

Root cause: `main.tsx` wraps the app in `<StrictMode>`, which in
development deliberately double-invokes every effect once — mount, run
its cleanup immediately, then mount again — specifically to surface bugs
like this one. Both `WalletConnect`'s auto-continue and `EnsClaim`'s
auto-advance used the same pattern: a `firedRef` ref flipped to `true`
before scheduling `setTimeout`, with the effect's cleanup calling
`clearTimeout`. Under StrictMode's double-invoke: the first invocation
sets `firedRef.current = true` and schedules the timer; the immediate
simulated-unmount cleanup cancels that timer; the second invocation checks
`firedRef.current`, sees it already `true`, and returns without scheduling
a replacement. No timer survives to ever fire — `onReady`/`onContinue`
never gets called, and the screen sits there indefinitely. The ref was
solving the wrong problem: it exists to stop *real* re-renders from
re-arming the timer, but a mount-once effect (`deps: []`) doesn't need
that protection at all — it needs each invocation to clean up only the
timer it itself created.

Fixed both by dropping the ref entirely in favor of a closure-scoped
`cancelled` flag alongside the timer:

```ts
useEffect(() => {
  let cancelled = false
  const timer = setTimeout(() => {
    if (!cancelled) onReady()
  }, AUTO_CONTINUE_MS)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}, [])
```

Each invocation now owns and can only cancel its own timer, so StrictMode's
extra mount cycle in dev correctly ends up with exactly one live timer that
fires once — same as a real single mount would in production, where
StrictMode's double-invoke doesn't happen at all. `PayoutRecords`'
`autoSubmit` effect didn't have this bug (no `setTimeout`/cleanup pair to
interact badly with the double-invoke — its ref guard alone is sufficient
there), so left unchanged. `pnpm build` and Biome both clean.

Also: the earlier screenshot showing "You're signed in" with no ENS name
during this same test was correct, not a bug — that gate appears *before*
any name is claimed (it's gating the Claim step itself), so there's
nothing yet to show instead of the raw address. The "Signed in as
`<name>`.sapore.eth" copy only applies once a name already exists, i.e.
on the Payout step's wallet gate.

### Fri 26 Sept — the auto-continue timer worked; the merge condition was unreachable

Santino got past the wallet screen this time (the StrictMode fix worked)
and successfully claimed `frech.sapore.eth` for real — but landed back on
the old manual "Set payout address →" button instead of the merged
one-click flow. Not a bug in the auto-advance code itself: `autoMerge`
requires both `claimMode === 'real'` AND `recordMode === 'real'`, and
those were two *independent* toggles, one shown on the Claim step, the
other only shown on the Payout step. The Payout step doesn't render at all
until *after* the claim has already finished — so on any first pass
through the flow, there was no point at which both toggles could be
"real" before the Claimed screen's `autoAdvance` value got locked in for
that render. The merge condition was reachable only on a *second* pass in
the same tab (mode state persisted across "Restart flow"), never on a
fresh run — exactly what Santino hit.

Fixed by collapsing `claimMode`/`recordMode` into one shared `mode` state
in `App.tsx`, decided once via a single `ModeToggle` that now renders on
both the Claim and Payout steps but reads/writes the same value. Setting
Real on the Claim step is now sufficient — it carries through to Payout
automatically, no second toggle to remember. `handleModeChange` bumps
both `claimRun` and `recordRun` so either step gets a fresh mount if its
toggle is touched, matching the existing scenario-chip remount pattern.
Simulated mode's per-step scenario chips are untouched (`claimScenario`/
`recordScenario` stay separate, as they should — those are what actually
differ between the two demo scenarios, not the mode). `pnpm build` and
Biome both clean.

### Fri 26 Sept — the merge actually ran end to end, then hit a real cross-RPC race

With the shared toggle fixed, Santino got all the way through: claimed
`french.sapore.eth` for real, and the app auto-continued straight into
the payout write — but that write reported "french.sapore.eth has no
resolver yet," on a name that had *just* been registered for real, tx
hash and all.

Traced it to which RPC each side actually talks to. `apps/service`
(the backend that registers the name) uses `SEPOLIA_RPC_URL`, defaulting
to `https://ethereum-sepolia-rpc.publicnode.com`. The browser's own
`publicClient` in `privyWallet.ts` — the one `writeChefRecords()` uses to
look up the resolver before writing — was calling `http()` with no URL,
which falls back to viem's own Sepolia default:
`https://11155111.rpc.thirdweb.com`, confirmed with a one-line Node check
against the installed `viem/chains` package rather than assumed. Two
different providers can briefly disagree about the very latest block —
public RPC endpoints load-balance across multiple backend nodes that
don't all advance in lockstep — so a registration one provider just
confirmed isn't guaranteed to be visible yet through a different one.
The new auto-merge flow made this worse by removing the natural pause a
human clicking two separate buttons used to provide.

Two changes, addressing both the root cause and normal jitter:

1. Added `VITE_SEPOLIA_RPC_URL` (`apps/web/.env.example`,
   `vite-env.d.ts`) and pointed `privyWallet.ts`'s `publicClient` at it,
   defaulting to the same `publicnode.com` URL `apps/service` already
   uses. Same provider, same view of the chain — removes the cross-
   provider race at its source rather than masking it.
2. `writeChefRecords()` (`packages/ens/src/chefRecords.ts`) now retries
   its resolver lookup up to 3 times, 1.2s apart, before concluding
   `no_resolver` — cheap insurance against ordinary propagation jitter
   even *within* one provider's own load-balanced nodes, not just across
   providers.

Also: `packages/ens` had never declared `@types/node`, so `setTimeout`
(needed for the retry delay) had no ambient type in a package with no DOM
lib either — same class of issue as `packages/core`'s earlier
`TextEncoder`/`TextDecoder` fix, and fixed the same way: declare
`@types/node` explicitly rather than relying on it arriving transitively.
`pnpm -r build` and Biome both clean.

### Fri 26 Sept — the real bug: viem's getEnsResolver doesn't know ENSv2 exists

Santino confirmed he'd rebuilt `@sapore-pay/ens` and rerun the whole flow
twice more (`french.sapore.eth`, `carlos.sapore.eth`), both freshly
claimed for real, both still hitting "no resolver yet." 100% reproducible
across different aliases is a different signature than an RPC-timing race
— a race would be intermittent. That ruled out the previous entry's two
fixes as the actual cause (they're still reasonable hygiene, just not
what was failing here).

Went back to first principles instead of guessing again: `writeChefRecords`
was calling `publicClient.getEnsResolver({ name })` — viem's own built-in
ENS action. Fetched the actual `ensdomains/contracts-v2` source from GitHub
(not recalled from training) to check what that action is supposed to
resolve through. `getEnsResolver` walks the **legacy** ENS Registry /
Universal Resolver system — the one-contract-forever architecture ENSv1
shipped with. ENSv2 (what this whole project is built on, per
`SaporeChefRegistrar.sol`'s own `IPermissionedRegistry`/`IRegistry`
imports) replaces that with per-parent registry contracts that the legacy
Universal Resolver has no way to know about. So `getEnsResolver()` was
never going to find anything here — not intermittently, not under any RPC
provider, ever. It's not a race; it doesn't work for ENSv2 names at all.

Fetched `IRegistry.sol` directly to find the real function:
`getResolver(string calldata label) external view returns (address)`,
callable directly on the specific registry contract that owns a name's
parent (here, ENSv2's `UserRegistry` deployed for `sapore.eth`'s Chef
subnames — `0x9a932e911c7FD7DfD54d1B11Ef4fE0c9aa46862d`, from
`01-deploy-user-registry.mjs`). Rewrote `writeChefRecords()`
(`packages/ens/src/chefRecords.ts`) to call that directly via
`publicClient.readContract()` instead — passing the bare label (e.g.
`"carlos"`), not the full dotted name, matching the real interface.
Threaded a new `registryAddress` parameter through both callers:
`apps/service`'s `ENS_REGISTRY` config (same default address) and
`apps/web`'s new `VITE_ENS_REGISTRY` env var. Kept the retry loop from the
previous entry — it's now retrying the *correct* call, so it still earns
its keep against ordinary propagation jitter, just no longer papering
over a lookup that could never have succeeded regardless.

Honesty note: the previous entry's RPC-consistency and retry fixes were a
plausible, reasoned hypothesis at the time, tested against real (if
incomplete) evidence — but wrong. Recording that rather than quietly
folding it into this entry, per this log's own standing rule about
walked-back claims.

`pnpm --filter @sapore-pay/ens build` and `pnpm -r build` both clean;
Biome clean on every touched file. Not yet verified against the live
chain from this sandbox — no network egress to any Sepolia RPC provider
here (confirmed via the agent proxy's own status endpoint, same
restriction noted earlier in this log), only to GitHub via WebFetch, which
is how the interface itself got verified. Next real test is Santino's own
machine.

### Fri 26 Sept — the getResolver fix worked; hit a real gas estimation bug next

Confirmed live on Santino's machine: the resolver lookup fix worked. For
the first time all session, a real Privy signature prompt appeared showing
an actual constructed transaction (`To: 0x0356...2858`, the real shared
resolver) — proof `getResolver(label)` found it correctly this time. Privy
did warn "Execution reverted for an unknown reason" in its own pre-flight
simulation, but on Sepolia with a sub-cent fee, approving it anyway to get
a real on-chain answer was the fastest way to find out what that meant —
it came back "intrinsic gas too low," not the "unauthorized" outcome the
revert warning might have suggested.

"Intrinsic gas too low" is an RPC-level rejection before the resolver
contract even runs — the declared gas limit was below the minimum needed
just to include a transaction with this much calldata (a multicall
bundling 2-4 `setAddr`/`setText` calls isn't small). `writeChefRecords()`'s
`walletClient.writeContract()` call never set an explicit `gas` value,
relying on automatic estimation — which works fine for `apps/service`'s
backend-signed writes (a real viem `WalletClient` talking straight to an
RPC node), but the Chef-signed path routes through Privy's own embedded-
wallet provider (`custom(provider)` in `privyWallet.ts`), which does its
own gas estimation for `eth_sendTransaction` and underestimated for a call
this size.

Fixed by passing an explicit `gas: 600_000n` on that write — comfortably
above what a 2-4 call multicall actually costs, and most wallet providers
use a caller-supplied gas value as-is rather than re-estimating once it's
present. `pnpm --filter @sapore-pay/ens build` and Biome both clean.

### Fri 26 Sept — funded wallet hit "insufficient funds," then a real UI bug on retry

The "intrinsic gas too low" fix worked and Privy built a valid transaction
— it just failed with "insufficient funds for gas * price + value: have 0
want 751007651400000." Not a bug: the Privy embedded wallet is a brand new
address that had never held any Sepolia ETH — every prior transaction
(registration) was paid for by Sapore's backend key, and this is the first
one the Chef's own wallet has to pay for itself. Santino funded it from
another wallet and clicked the error screen's "Try again."

That surfaced a real bug in `PayoutRecords.tsx`: the generic `ErrorState`'s
retry handler reset `phase` to `{ kind: 'input', address: '' }` —
hardcoded empty, not back to `defaultAddress`. Since `locked` is computed
separately from `defaultAddress` (unaffected by the reset), the heading
still read "You'll get paid to your sofia.sapore.eth wallet" while the
locked mono display underneath rendered `shorten('')` — literally just
"…" — and clicking "Set payout address" submitted that empty string,
immediately hitting the address-format validation error. A real, visible
inconsistency: locked copy paired with a blanked-out value.

Fixed by resetting to `defaultAddress` instead of `''` on retry — the
correct behavior once `locked` is true is "show the same wallet address
again," not "ask the Chef to type an address a locked screen never let
them type in the first place." `pnpm --filter @sapore-pay/web build` and
Biome both clean.

### Fri 26 Sept — first fully real end-to-end run, start to finish

With the wallet funded and the retry-address bug fixed, Santino ran the
whole flow again and it completed: World ID → claimed a name for real on
ENSv2 Sepolia (backend-signed) → payout address written for real (Chef-
signed via the connected Privy wallet, `Approve` in the wallet's own
transaction-review UI, "Transaction complete!") → landed on "Payout
address set," showing both tx hashes together (`Name claim: 0xc39c9b3b…`,
`Payout: 0xaa0aed2c…`).

This is the first time, across every attempt this session, that the
complete Chef onboarding path — World ID, a real ENSv2 subname claim, and
a real Chef-signed payout record write — has worked end to end through the
actual product UI, with no manual script, no simulated step standing in
for a real one. Everything fixed today (the `getResolver` protocol
mismatch, the gas limit, the shared-toggle UX, the StrictMode timer bug,
the retry-address bug) was in the path this run just exercised
successfully.

Nothing left to fix from this run — recorded as the milestone it is, not
folded silently into the next bug report.

### Fri 26 Sept — real World ID, and a genuine SDK-version tradeoff caught in time

With the PR merged and ~20 hours left before the ETHGlobal Tokyo submission
deadline (Sun 09:00 JST), World ID was the last targeted-prize gap: `packages/world`
was still a planning-comment stub, and `apps/web`'s onboarding step had been
simulated all session.

Started by installing `@worldcoin/idkit` to inspect its real types before
writing anything — and it resolved to `4.3.0`, not the `app_id`/`action`/`signal`
model the repo's own planning comment (and an initial web search) assumed.
Reading the actual installed `.d.ts` files (not a webpage summary) showed v4 is
a materially different protocol: every request requires a `rp_context` —
a nonce/timestamp bundle that must be signed with an RP private key
(`@worldcoin/idkit-server`'s `signRequest({ signingKeyHex, ... })`, confirmed
by reading its own source) — plus a QR-code/polling flow (`connectorURI`,
`pollUntilCompletion()`) in place of a simple modal callback.

Checked `npm view @worldcoin/idkit versions` and found the real version
history jumps straight from `2.4.2` to `4.0.0-dev.*` — no 3.x ever shipped.
`2.4.2` is a real, currently-installable release with the classic
widget/callback model, and v4 itself still ships `orbLegacy`/`deviceLegacy`
presets documented as "for compatibility with older IDKit versions" — so old
proofs remain first-class in the protocol, not a dead path.

Given the deadline, flagged this tradeoff to Santino directly rather than
picking silently: v2.4.2 (lower risk, well-documented, still fully real — not
simulated) vs. v4 (current, but requires learning RP-signing live under time
pressure, plus a rebuilt polling-based UX). He created the World app in the
Developer Portal while this was being resolved; its Configuration page showed
the RP's signer key is **Developer-Portal-managed by default** ("Switch to
self-managed" is a separate opt-in danger-zone action) — which would have
removed the signing concern specifically, but the QR/polling UX rebuild and
the still-unconfirmed v4 server-verify shape remained. Session model was
switched to Opus for this decision and the implementation that followed, on
Santino's own call given the stakes; switched back to Sonnet once the design
and hard verification work were done and what remained was mechanical.

Went with **v2.4.2**. Installed it, then read its actual types rather than
trust the same kind of summary that had just been wrong once already:
`useIDKit()` for imperative open control, `IDKitWidget` (`app_id`, `action`,
`signal`, `verification_level`, `handleVerify`, `onSuccess`, `onError`),
`ISuccessResult` (`proof`, `merkle_root`, `nullifier_hash`,
`verification_level`), and — the best find — `verifyCloudProof` exported from
`@worldcoin/idkit-core/backend`, IDKit's own official server-verification
helper, so `packages/world` didn't need a hand-rolled HTTP call to World's
verify endpoint at all.

Implemented:
- `packages/world/src/index.ts` — replaced the stub with `verifyWorldProof()`,
  calling `verifyCloudProof` and mapping World's own `max_verifications_reached`
  code onto `already_registered` — that's World's per-action verification
  limit doing the "one human, one Chef account" enforcement natively, which is
  also why this module stores nothing: there's no local nullifier table to
  keep in sync with World's own.
- `apps/service`: new `WORLD_APP_ID`/`WORLD_ACTION` config (empty-string
  default, same "report not configured rather than crash" pattern as
  `ENS_BACKEND_PRIVATE_KEY`), and `POST /world/verify`, deliberately left
  without auth — a caller can't forge a World proof, and a replayed one is
  bound to its original `signal`, so the worst outcome of an unauthenticated
  hit is being told your own real proof is valid.
- `apps/web/src/lib/worldVerifier.tsx` (new) — the actual bridge work: IDKit
  is a mounted component owning a modal, not an awaitable function, but
  `ChefOnboarding` is built around `await verifier.verify(...)`. Wraps the
  widget in a hook that opens it and returns a promise IDKit's own callbacks
  settle. The one gap IDKit has no callback for — closing the modal without
  acting — is caught by watching the widget's own `open` state transition
  from true to false with a promise still pending; left unhandled, that's the
  same "hangs on a spinner forever" class of bug the ENS claim screen hit
  earlier this session, just in a new place.
- `apps/web/src/App.tsx` — the World step now shares the same Real/Simulated
  toggle as Claim/Payout, gated on `VITE_WORLD_APP_ID` being set (no dead
  "Real" option that can only ever fail); the widget is mounted outside the
  step switch since unmounting it mid-verification would strand the promise.

`pnpm -r build` clean across all 9 workspace packages; Biome clean on every
touched file (one real compiler catch along the way: an early draft read
`.message` off a union where two of the three non-`verified` branches don't
have one — fixed with an exhaustive switch instead of narrowing on `!==`).

Not yet tested against a real phone/World App — that's Santino's next step,
same "real chain, sandbox has no egress to it" limitation as ENSv2 and
Privy before it.

### Fri 26 Sept — a real proof, a real rejection, and a real protocol-version mismatch

Santino tested on his phone: the World App side completed genuinely
("Congratulations! You have successfully shared your proofs anonymously"),
confirming the widget's app_id/action/signal config is correctly wired to
World's real infrastructure. IDKit's own modal then showed "Verification
Declined." Browser console gave the exact reason:
`{code: 'failed_by_host_app', message: 'Action not found.'}` —
`failed_by_host_app` is IDKit's code for "the app's own `handleVerify`
threw," and the message is `verifyCloudProof`'s response forwarded through
unchanged — so this was a real answer from World's server, not a local bug.

Read `verifyCloudProof`'s actual shipped source (not just its `.d.ts`) to
confirm its hardcoded default: `POST
https://developer.worldcoin.org/api/v2/verify/{app_id}` — same domain
regardless of "sandbox" vs "production", ruling out an environment-URL
mismatch as the cause. Search results (not independently verified against
World's own docs — `docs.world.org` is blocked from this sandbox's egress,
confirmed via the agent proxy's own status endpoint) describe the *current*
endpoint as `/api/v4/verify/{rp_id}`, with `app_id` "still accepted for
backward compatibility." That lines up exactly with what the Developer
Portal showed: this app has a separate RP ID (`rp_45bf...`) alongside its
App ID, i.e. it was provisioned under the newer RP-based system — plausible
that the legacy v2 endpoint simply has no visibility into actions on an
RP-structured app at all, independent of whether the action itself is
correctly named or configured.

Fixed by overriding only `verifyCloudProof`'s `endpoint` parameter to
`/api/v4/verify/{app_id}` on the same `developer.worldcoin.org` host —
deliberately the smallest possible change (one URL, not also rewriting the
request body) so a live retest isolates exactly one variable. Also added
`WORLD_VERIFY_ENDPOINT_BASE` as an env override, since the domain/path here
is the one thing in this module that's an informed inference, not something
verified against installed source or a reachable spec — if this exact guess
turns out wrong, it's a env change, not a redeploy, to correct.

Same `@types/node` gap as `packages/ens`/`packages/core` earlier today —
`packages/world` uses `process.env` for the override but had never declared
the dependency. Fixed the same way. `pnpm -r build` clean across all 9
packages; Biome clean.

Honesty note: the exact v4 request body/domain is inferred from search
results describing World's own docs, not read directly from them or from
installed source — flagged as such rather than presented as verified,
per this log's standing practice. Next real test tells us if the inference
holds.

### Fri 26 Sept — the v4 endpoint fix confirmed, and confirmed insufficient

Retest on Santino's phone: the error changed from `Action not found.` to
`responses array is required` — proof the URL fix from the previous entry
was correct (the v4 endpoint is genuinely being hit now), but it also proved
the real, fundamental problem: v2.4.2's client produces the old flat proof
shape (`{proof, merkle_root, nullifier_hash, verification_level}`), and v4's
endpoint wants `{responses: [...]}`. Not a reshape-in-place fix — the
underlying ZK proof is cryptographically bound to different public inputs
between protocol versions, so no amount of remapping the v2 shape produces
a valid v4 body. The only real fix is a client-side rewrite onto v4's actual
protocol.

Santino confirmed committing to that rewrite (switched to Opus 5.5 for the
harder protocol-reverse-engineering work, with standing instructions to keep
going and only stop for a genuinely close call). One near-miss along the
way: Santino was about to click "Switch to self-managed" in the Developer
Portal on my earlier suggestion that it was needed to get an RP signing key
for `rp_context`. Seeing the actual dialog (irreversible, hands over
on-chain transaction custody for the RP, not just this signature) was enough
to catch the mistake before it was clicked — redirected to the Portal's API
Keys page instead, on search evidence that a Portal-hosted `GET /rp-context`
endpoint, Bearer-authenticated, is the intended mechanism for an app that
stays Developer-Portal-managed. Flagging this plainly: that endpoint's exact
host/path/shape is still inference, not confirmed against reachable docs
(`developer.world.org`/`docs.world.org` are both blocked from this sandbox)
or installed source — a live test is what confirms or corrects it, same as
the verify endpoint before it.

This time, before writing any client code, read the actual installed
`@worldcoin/idkit@4.3.0` and `@worldcoin/idkit-core@4.3.0` `.d.ts` files
directly (both were already present in the pnpm store from the earlier
`pnpm add @worldcoin/idkit@2.4.2` downgrade, which had pulled 4.3.0
transitively first) rather than trusting search-summarized docs a second
time. That confirmed, from real source, not inference:

- `RpContext` (`rp_id`, `nonce`, `created_at`, `expires_at`, `signature`) —
  matches what `fetchSignedRpContext()` already assumed, unchanged.
- `IDKitRequestConfig.rp_context` is required, and `allow_legacy_proofs` is
  a required boolean, not optional — set to `false` here (new app, no v3
  nullifiers anywhere to reconcile).
- `IDKitRequestWidget` is a controlled component (`open`/`onOpenChange`
  props), not the `useIDKit()` hook v2.4.2 used — `open` is now a plain
  `useState` in `worldVerifier.tsx`.
- `proofOfHuman({ signal })` returns `{ type: "ProofOfHuman", signal }`,
  matching the "Proof of Human" language already used across
  `ChefOnboarding.tsx`.
- `onError` receives an `IDKitErrorCodes` enum value directly (no
  `{code, message}` object like v2 had) — includes a real `Cancelled`
  member, though `onOpenChange(false)`-with-no-result is kept as the primary
  cancellation signal (same reliable pattern as v2.4.2's ref-based version)
  since it isn't confirmed IDKit fires both for a plain dismissal.
- The v4 result's nullifier lives at `responses[0].nullifier`, confirming
  `packages/world`'s `extractNullifier()` (written on the earlier, correct
  inference) needed no changes.

Rewrote, end to end:

- `packages/world/src/index.ts` — dropped `verifyCloudProof` entirely.
  `verifyWorldProof()` now forwards the raw v4 result unmodified; added
  `fetchSignedRpContext()` calling the (still-inferred) Portal `rp-context`
  endpoint with the new `WORLD_API_KEY`. Also dropped the now-unused
  `@worldcoin/idkit-core` dependency.
- `apps/service/src/config.ts` — added `WORLD_API_KEY`.
- `apps/service/src/app.ts` — added `GET /world/rp-context`; updated
  `POST /world/verify` to the new `{proof}`-only body (no more `signal` as a
  separate field — it's already bound into the proof's `signal_hash` via the
  preset that produced it).
- `apps/web/package.json` — re-pinned `@worldcoin/idkit` to `^4.3.0`.
- `apps/web/src/lib/worldVerifier.tsx` — full rewrite onto
  `IDKitRequestWidget`/`proofOfHuman`/`rp_context`. `verify()` is now async:
  it fetches a fresh `rp_context` from `apps/service` before opening the
  widget, since each has a short expiry and can't be reused across attempts.
  Nullifier extraction stays entirely server-side, as before.
- Removed `VITE_WORLD_VERIFICATION_LEVEL`/`VerificationLevel` — that was a
  v2/v3 concept (Orb vs Device credential selection) with no equivalent
  surface in v4's exported API; `proofOfHuman()`'s own doc comment says it
  requests "a World ID 4.0 proof-of-human credential with legacy Orb
  fallback" on its own, so there's nothing left to select.
- Fixed a stale doc comment in `humanVerifier.ts` still naming the old
  `/api/v2/verify/{app_id}` endpoint.

`pnpm -r build` clean across the full workspace (including `apps/web`'s own
`tsc` pass — the v4 types checked out against real usage, not just
compiled in isolation). Biome clean on every touched file.

Still unverified, flagged plainly: the `rp-context` endpoint's exact
host/path/query-param shape. Everything else in this rewrite is now backed
by installed source, not inference. Next step is Santino's live retest.

### Fri 26 Sept — the rp-context guess was wrong, and wrong in an interesting way

Live retest: `GET /world/rp-context` came back `502`, body
`{"message":"World returned 404 fetching rp_context."}` — the guessed
Portal-hosted `POST/GET .../api/v4/rp-context` endpoint doesn't exist. This
is the one piece flagged as unverified in the previous entry, so finding out
it was wrong isn't itself surprising. What it forced was a real architecture
correction, not just a URL swap.

Reread `@worldcoin/idkit-server@1.1.1`'s actual installed source (the
package `verifyWorldProof`'s neighbor, already in the pnpm store) rather
than trusting search results a second time on the same question. Its entire
public surface is `signRequest({signingKeyHex, action?, ttl?})` — a *pure
local computation* (EIP-191 signing over a nonce/timestamp payload,
implemented in JS, no network call). There is no `fetchFromCloud()` or
equivalent anywhere in the package. Three independent web searches (not
just one, this time, on the strength of last entry's lesson) converged on
the same shape of answer: an RP's signing key is shown once by the
Developer Portal at RP-registration time, must be written to a server-only
secret store immediately, and every RP — self-managed or not — signs
`rp_context` locally with `signRequest()`. There is no "Portal signs it for
you over HTTPS, authenticated by an API key" mechanism in the actual
protocol. That was this module's own invention, built on a webset summary I
couldn't independently check (`docs.world.org` blocked), and it doesn't
survive contact with the SDK's real source or a live 404.

Net effect on the "self-managed" near-miss from two entries ago: it's very
likely a genuine non-issue for getting a signing key specifically — every
RP appears to get a private key up front regardless, and "self-managed"
gates something else (plausibly who submits the RP's own on-chain
registration/rotation transaction, matching the dialog's specific wording
about "on-chain transaction custody"). Still not independently confirmed
against reachable docs, so still not clicking it — but the working theory
changed from "maybe we do need that" to "probably unrelated to this
problem."

Rewrote `packages/world/src/index.ts` again: dropped `WORLD_API_KEY` and
the whole cloud-fetch codepath; added `buildSignedRpContext()`, a
synchronous function that calls `signRequest()` directly and maps its
`{sig, nonce, createdAt, expiresAt}` onto `rp_context`'s
`{signature, nonce, created_at, expires_at}` (plus the caller-supplied
`rp_id`, a separate identifier from `app_id` — confirmed already in an
earlier entry via the Portal's own UI showing both). `ttl: 600` (10
minutes), generous because the real flow includes a person picking up their
phone, not just a modal opening.

Config/routes updated to match: `apps/service/src/config.ts` swaps
`WORLD_API_KEY` for `WORLD_RP_ID` + `WORLD_RP_SIGNING_KEY` (no default on
the key, same reasoning as `ENS_BACKEND_PRIVATE_KEY`); `GET /world/rp-context`
in `app.ts` is no longer `async` in any meaningful sense — no `await` left
in it, since there's no network call anymore. Added
`@worldcoin/idkit-server` as a real dependency of `packages/world` (it was
already sitting in the pnpm store as a neighbor package, now used directly).
`.env.example` updated with what the key actually is and an explicit
warning to never let it near `apps/web`'s env.

`verifyWorldProof()` itself is untouched — that endpoint stays confirmed by
the live "Action not found." → "responses array is required" progression
from two entries back, which is real evidence, not inference.

`pnpm -r build` clean across the workspace; Biome clean on every touched
file. Two wrong guesses in a row on the same sub-problem (URL, then
mechanism) is a bad streak, but this one is no longer a guess: the fix is
built on `signRequest()`'s own confirmed signature, not a description of it.
What Santino needs to do next: find the RP's signing key in the Developer
Portal's World ID Configuration page (near where the RP ID is shown) and
add it as `WORLD_RP_SIGNING_KEY` — asked him to screenshot what's there
before adding anything, rather than guess a Portal UI flow a third time.

### Fri 26 Sept — rp_context signing works; the next wall was Vite, not World

Santino rotated the RP signer key in the Developer Portal ("Generate new
key" — the non-destructive rotation, not "Switch to self-managed"), put it
in `apps/service/.env` as `WORLD_RP_SIGNING_KEY`, and confirmed locally
that the key derives to the same address the Portal shows as the new RP
Signer (`0x9A9C...0055`) — checked with a one-liner that prints only the
derived address, never the key. Retest: `GET /world/rp-context` → 200. The
local-signing fix from the previous entry is confirmed by a live request.

The widget then opened and immediately closed with `generic_error`.
IDKit's React flow (`useIDKitFlow` in the installed dist) maps any
unrecognised exception to `GenericError` and only logs the real one when
`isDebug()` is true — which reads `window.IDKIT_DEBUG`. Setting that from
the console (no code change) surfaced it:
`Failed to initialize IDKit WASM: CompileError: WebAssembly.instantiate():
expected magic word 00 61 73 6d, found 3c 21 64 6f`. `3c 21 64 6f` is
`<!do` — the browser was handed `index.html` where it expected WASM.

Cause: `@worldcoin/idkit-core` locates its WASM with `new
URL("idkit_wasm_bg.wasm", import.meta.url)`. Vite's dev pre-bundler moves
the JS into `node_modules/.vite/deps/` but not the `.wasm`, so that URL
404s and Vite's SPA fallback answers with `index.html` (the Network tab's
"idkit_wasm_bg.wasm 200, 1.1 kB" was the HTML page, in hindsight). Fix:
`optimizeDeps.exclude: ['@worldcoin/idkit-core']` in `apps/web/vite.config.ts`
— the pre-bundled `@worldcoin/idkit` wrapper then imports core from its real
`node_modules` location, where the relative URL resolves. Verified against
a real dev server in the sandbox before pushing, not just reasoned about:
old path's first bytes `3c 21 64 6f` (Santino's exact error), new path's
`00 61 73 6d`, `application/wasm`, 895 KB. `vite build` was never affected
(it already emits `idkit_wasm_bg-*.wasm` as an asset), so this is
dev-only — deployment doesn't need it, but it doesn't hurt either.
