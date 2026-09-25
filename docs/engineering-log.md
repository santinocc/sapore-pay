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
