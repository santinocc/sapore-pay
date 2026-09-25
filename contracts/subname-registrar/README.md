# SaporeChefRegistrar

Registers `<alias>.sapore.eth` subnames on ENSv2 Sepolia for verified Chefs.
Built from ENSv2's "For Contract Developers" `SimpleSubnameRegistrar`
tutorial, with a deliberately narrower role bitmap and no renewal — see the
contract's own doc comments for why.

This is real product code (unlike `scripts/register-sepolia-ens` in the
private repo, which was a one-time operational action) — it's the mechanism
behind the ENS card's "Enhanced Access Control... central, not cosmetic"
requirement, and it's what `apps/web`'s `createOnChainSubnameClaimer` will
call once deployed.

## Status: all six steps run successfully — full pipeline verified on Sepolia

Every step below has been broadcast to Sepolia, in order, with a real Chef
(`marco.sapore.eth`) registered and delegated write access at the end. See
`docs/engineering-log.md` for all deployed addresses and tx hashes, and its
diagnosis history for the two real bugs found and fixed along the way (a
resolver `initialize()` argument-count mismatch, and a missing
access-control check in `SaporeChefRegistrar.register()`) — both fixed
before anything shipped.

Not yet done: wiring `apps/web`'s `createOnChainSubnameClaimer` (still an
honest stub) and `createOnChainRecordWriter` to these real deployed
contracts — that's app code, not a deploy script, and is tracked
separately from this runbook. Same network-access constraint as
`sapore/scripts/register-sepolia-ens` applies to all scripts below: this
session has no RPC access, so every step runs on your machine.

### Step 1 — deploy the UserRegistry proxy, and point `sapore.eth` at it

```bash
cd deploy
npm install
cp .env.example .env   # paste in the key that owns sapore.eth
node 01-deploy-user-registry.mjs
```

Does two things in one script: deploys a `UserRegistry` proxy via the
Verifiable Factory (deterministic address, no new Solidity to compile — it's
calling an already-deployed factory), then calls `setSubregistry()` on
`sapore.eth`'s entry in the `.eth` registry so it actually connects into the
ENS hierarchy. Skipping that second call is exactly the tutorial's own
documented failure mode: *"Registration succeeds but the name does not
resolve."*

Prints the deployed `UserRegistry` address — you'll need it for step 3.

### Step 2 — deploy the shared resolver

```bash
node 02-deploy-shared-resolver.mjs
```

One resolver, owned by Sapore, that every Chef subname points at (the
"shared resolver + delegation" side of the decision recorded in
`docs/engineering-log.md`, rather than deploying a fresh resolver per Chef).

Delegating a *specific* Chef write access to only their own node on this
resolver is a separate step (Step 6, `03-authorize-chef.mjs`) — run once per
Chef, after they've registered. Until it's run for a given Chef, Sapore's own
admin key is the only account that can write records for their name. That's
a real, demoable intermediate state (Sapore setting a Chef's payout address
on their behalf after they submit it through the UI), not the end state
where the Chef signs their own write.

Note the deployed resolver address for `.env`'s `SHARED_RESOLVER` (step 6)
and step 3's `resolver` argument to `register()`.

### Step 3 — deploy `SaporeChefRegistrar.sol` (needs Foundry)

This is the one step needing actual Solidity compilation — Foundry isn't
available in this session's sandbox and can't be installed there either.

```bash
forge init subname-registrar && cd subname-registrar
forge install ensdomains/contracts-v2
# copy foundry.toml and src/SaporeChefRegistrar.sol from this directory in
forge build
forge create src/SaporeChefRegistrar.sol:SaporeChefRegistrar \
  --rpc-url $SEPOLIA_RPC_URL --private-key $ENS_OWNER_PRIVATE_KEY --broadcast \
  --constructor-args $USER_REGISTRY 0xBA11ebdB3f9a2c5946D8629517f06364E53A2E10 $ENS_OWNER_ADDRESS 0 $ENS_OWNER_ADDRESS
```

`$USER_REGISTRY` is step 1's output. Payment token is MockUSDC (per
`scripts/register-sepolia-ens`); price is `0` — see the contract's doc
comment for why. The last argument, `backend`, is the only account allowed
to call `register()` — using the same admin key here since it's what Sapore's
backend controls throughout this event; a real deployment would use a
dedicated backend signer instead.

### Step 4 — authorize the registrar

```bash
cd ../../deploy   # back to contracts/subname-registrar/deploy
node 04-authorize-registrar.mjs <registrarAddress>   # step 3's output
```

Grants `SaporeChefRegistrar` `ROLE_REGISTRAR` on the `UserRegistry` —
`grantRootRoles(roleBitmap, account)` and `ROLE_REGISTRAR`'s bit value
(`1 << 0`) are both confirmed against verified Sepolia source
(`EnhancedAccessControl.sol` / `RegistryRolesLib.sol`), not just docs.

Not `ROLE_REGISTRAR | ROLE_RENEW` — this contract has no `renew()`.

### Step 5 — register a Chef

```bash
node 05-register-chef.mjs alice 0xChefWalletAddress
```

Checks `isAvailable`, then calls `register(label, chefWallet,
resolverAddress)` (resolver = step 2's output) and prints the minted
`tokenId`. Must be signed by whichever address step 3's deploy used as
`backend` — `register()` reverts `Unauthorized()` otherwise.

### Step 6 — delegate the Chef's own write access

```bash
node 03-authorize-chef.mjs alice 0xChefWalletAddress
```

Grants `alice`'s own wallet `ROLE_SET_ADDR | ROLE_SET_TEXT` on
*only* `alice.sapore.eth` (via `authorizeNameRoles`, per the "Permissioned
Resolver" doc's "Delegating a Single Text Key" example) — exactly the two
record types `apps/web/src/lib/ensRecords.ts`'s `writeChefRecords()` writes,
nothing else, and only on their own name. Before this runs, only Sapore's
admin key can write `alice.sapore.eth`'s records; after, `alice`'s own
wallet can call `writeChefRecords()` directly, and attempting to write any
other name still reverts with `EACUnauthorizedAccountRoles`.

Requires `SHARED_RESOLVER` in `.env` (step 2's output).

Once this runs, `getEnsAddress({ name: 'alice.sapore.eth' })` resolves to
whatever address `alice` (or Sapore, before this step) last wrote.

## Why the resolver parameter isn't `address(0)` here

Unlike `sapore.eth`'s own registration (which used `resolver = address(0)`
deliberately, since nothing needed to resolve immediately), a Chef's subname
needs an actual resolver to be useful the moment it's claimed — otherwise
every claim needs a second transaction just to reach a state the tutorial's
own troubleshooting table calls out as confusing ("Registration succeeds but
the name does not resolve"). Which resolver to pass — a shared one Sapore
deploys with per-Chef role delegation, vs. one deployed per Chef via the
Verifiable Factory — is the "shared resolver + delegation" decision recorded
in `docs/engineering-log.md`; either way, `writeChefRecords()` in
`apps/web/src/lib/ensRecords.ts` already implements the write side correctly
for both.
