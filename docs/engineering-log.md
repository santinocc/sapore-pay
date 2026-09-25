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
| First IDKit line written | — | _pending_ | — |
| **First successful World ID verification** | — | _pending_ | — |
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
