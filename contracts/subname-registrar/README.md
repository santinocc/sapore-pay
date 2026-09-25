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

## Status: contract written; deployment scripts written; not yet run

Everything needed to deploy is now specified — no more guessed interfaces —
but nothing here has actually been broadcast to Sepolia yet. Same
network-access constraint as `sapore/scripts/register-sepolia-ens`: this
session has no RPC access, so every step below runs on your machine.

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

**Not yet wired:** delegating a *specific* Chef write access to only their
own node on this resolver (`authorize*Roles`) — the exact function signature
is on the "Permissioned Resolver" contract page, not yet read in this
session. Until that's read, Sapore's own admin key is the only account that
can write records on it. That's a real, demoable intermediate state (Sapore
setting a Chef's payout address on their behalf after they submit it through
the UI), just not the end state where the Chef signs their own write — worth
sending that doc page over next if you want the full delegation story.

Prints the deployed resolver address — you'll need it for step 3.

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
  --constructor-args $USER_REGISTRY 0xBA11ebdB3f9a2c5946D8629517f06364E53A2E10 $ENS_OWNER_ADDRESS 0
```

`$USER_REGISTRY` is step 1's output. Payment token is MockUSDC (per
`scripts/register-sepolia-ens`); price is `0` — see the contract's doc
comment for why.

### Step 4 — authorize the registrar

```ts
const ROLE_REGISTRAR = 1n << 0n
await wallet.writeContract({
  address: userRegistryAddress, // step 1's output
  abi: [{
    name: 'grantRootRoles', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'roleBitmap', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  }],
  functionName: 'grantRootRoles',
  args: [ROLE_REGISTRAR, registrarAddress], // step 3's output
})
```

Not `ROLE_REGISTRAR | ROLE_RENEW` — this contract has no `renew()`.

### Step 5 — verify

`isAvailable("alice")` should read `true`; after
`register("alice", chefWallet, resolverAddress)` (resolver = step 2's
output), it should read `false`, and `getEnsAddress({ name:
'alice.sapore.eth' })` should eventually resolve.

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
