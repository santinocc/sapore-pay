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

## Status: contract written, deployment blocked on one more doc page

The registrar contract itself (`src/SaporeChefRegistrar.sol`) is fully
specified from the tutorial and ready to compile and deploy. What's still
missing: **the exact steps to deploy a `UserRegistry` proxy via the
Verifiable Factory.** The tutorial references a separate guide,
"Deploying a Registry Proxy," under the Verifiable Factory docs — not yet
read in this session. Without it, the `userRegistryAddress` this contract's
constructor needs doesn't exist yet.

If you can grab that page the same way as the others (copy the full content
of the docs page for "Deploying a Registry Proxy" — likely linked from the
Verifiable Factory architecture page), that unblocks the rest.

## Once the UserRegistry proxy exists

1. **Point `sapore.eth` at it** (connects the new registry into the ENS
   hierarchy — without this, names register but never resolve):
   ```ts
   import { keccak256, toHex, parseAbi } from 'viem'
   const permissionedRegistryAbi = parseAbi([
     'function setSubregistry(uint256 anyId, address subregistry)',
   ])
   await wallet.writeContract({
     address: ethRegistryAddress, // 0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67
     abi: permissionedRegistryAbi,
     functionName: 'setSubregistry',
     args: [BigInt(keccak256(toHex('sapore'))), userRegistryAddress],
   })
   ```
2. **Deploy this contract**:
   ```bash
   forge init subname-registrar && cd subname-registrar
   forge install ensdomains/contracts-v2
   # copy foundry.toml and src/SaporeChefRegistrar.sol from this directory in
   forge build
   forge create src/SaporeChefRegistrar.sol:SaporeChefRegistrar \
     --rpc-url $SEPOLIA_RPC_URL --private-key $ENS_OWNER_PRIVATE_KEY --broadcast \
     --constructor-args $USER_REGISTRY 0xBA11ebdB3f9a2c5946D8629517f06364E53A2E10 $ENS_OWNER_ADDRESS 0
   ```
   (Payment token is MockUSDC per `scripts/register-sepolia-ens`; price is
   `0` — see the contract's doc comment for why.)
3. **Grant it `ROLE_REGISTRAR`** on the UserRegistry (not `ROLE_RENEW` — this
   contract has no `renew()`):
   ```ts
   const ROLE_REGISTRAR = 1n << 0n
   await wallet.writeContract({
     address: userRegistryAddress,
     abi: [{
       name: 'grantRootRoles', type: 'function', stateMutability: 'nonpayable',
       inputs: [
         { name: 'roleBitmap', type: 'uint256' },
         { name: 'account', type: 'address' },
       ],
       outputs: [{ name: '', type: 'bool' }],
     }],
     functionName: 'grantRootRoles',
     args: [ROLE_REGISTRAR, registrarAddress],
   })
   ```
4. Verify: `isAvailable("alice")` should read `true`; after `register("alice", chefWallet, resolverAddress)`, it should read `false`, and `getEnsAddress({ name: 'alice.sapore.eth' })` should eventually resolve once a resolver is set.

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
