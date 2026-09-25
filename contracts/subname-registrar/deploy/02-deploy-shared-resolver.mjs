/**
 * 02-deploy-shared-resolver.mjs — deploys ONE Permissioned Resolver proxy
 * that all Chef subnames point at, owned by Sapore.
 *
 * This is the "shared resolver + delegation" side of the decision recorded
 * in docs/engineering-log.md (the alternative being a separate resolver
 * deployed per Chef). One deployment total, not one per Chef.
 *
 * Per-Chef delegation (a specific Chef's wallet writing only their own name)
 * is now wired — see 03-authorize-chef.mjs, built from the "Permissioned
 * Resolver" doc's "Delegating a Single Text Key" example. This script only
 * deploys the resolver itself.
 *
 * This reverted three times before the real cause was found: the ENSv2 docs
 * describe `initialize(address admin, uint256 roleBitmap, bytes[] setters)`
 * (matching the Verifiable Factory doc's generic example and the
 * Permissioned Resolver doc's own Reference section), but the actual
 * deployed contract — read directly from its verified Sepolia Etherscan
 * source, `PermissionedResolver.sol` — only takes TWO arguments:
 *
 *   function initialize(address admin, uint256 roleBitmap) external initializer {
 *       if (admin == address(0)) revert InvalidOwner();
 *       __UUPSUpgradeable_init();
 *       _grantRoles(ROOT_RESOURCE, roleBitmap, admin, false);
 *   }
 *
 * Every prior attempt encoded a call to a 3-arg function that doesn't
 * exist on this implementation, so the delegatecall never matched any
 * function and reverted with no data — same symptom whether the roleBitmap
 * or the salt/version changed, because neither was ever the problem. Full
 * diagnosis history (bitmap, then collision, then this) in
 * docs/engineering-log.md. Lesson: the docs describe the *intended*
 * interface; pre-mainnet contracts ("not yet final" per the doc's own
 * banner) can and did drift from it, so verified source is ground truth.
 *
 * There is no `setters` array to bundle initial records into this call
 * anymore — that's fine, writeChefRecords() in apps/web always writes
 * records as a separate transaction anyway.
 *
 * Usage: same as 01-deploy-user-registry.mjs (same package.json / .env).
 */

import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  stringToHex,
  zeroHash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const VERIFIABLE_FACTORY =
  process.env.ENS_VERIFIABLE_FACTORY ||
  '0xD2a632D8a8b67c2c4398c255CbD7aF8dd7236198'
const PERMISSIONED_RESOLVER_IMPL =
  process.env.ENS_PERMISSIONED_RESOLVER_IMPL ||
  '0xdcE5205A553573FFd47629327DDdf36186022FfA'

const PRIVATE_KEY = requireEnv('ENS_OWNER_PRIVATE_KEY')
const RPC_URL =
  process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing ${name} — copy .env.example to .env and fill it in.`)
    process.exit(1)
  }
  return value
}

const verifiableFactoryAbi = parseAbi([
  'function deployProxy(address implementation, uint256 salt, bytes data)',
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
])

const permissionedResolverAbi = parseAbi([
  'function initialize(address admin, uint256 roleBitmap)',
  'function recordVersions(bytes32 node) view returns (uint256)',
])

// Built from just the resolver's real roles (0, 4, 8, 12, 16, 20, 24, 28,
// 32, 36, 124, each with an admin variant at `+128`) rather than the docs'
// over-inclusive blanket 0x1111...1111 pattern — narrower is strictly
// better practice, though (per the header comment) it was never what
// caused any of the reverts.
const RESOLVER_ROLE_BITS = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 124]
const RESOLVER_ALL_ROLES = RESOLVER_ROLE_BITS.reduce(
  (bitmap, bit) => bitmap | (1n << BigInt(bit)) | (1n << BigInt(bit + 128)),
  0n,
)

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY)
  const client = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  })
  const wallet = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  })

  console.log(`Deployer / resolver admin: ${account.address}\n`)

  // Salt scheme per the Verifiable Factory doc: keccak256("OwnedResolver",
  // owner, version) — one resolver per owner. "Owner" here is Sapore's own
  // admin account, since this is Sapore's shared resolver, not a per-Chef one.
  //
  // ENS_RESOLVER_SALT_VERSION exists from an earlier (ruled-out) collision
  // hypothesis — kept as a harmless escape hatch in case version 0's address
  // is ever genuinely occupied, but there's no reason to set it now.
  const version = BigInt(process.env.ENS_RESOLVER_SALT_VERSION || '0')
  const resolverSalt = BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }],
        [keccak256(stringToHex('OwnedResolver')), account.address, version],
      ),
    ),
  )
  console.log(`Salt version: ${version} (salt: ${resolverSalt})\n`)

  const resolverInitData = encodeFunctionData({
    abi: permissionedResolverAbi,
    functionName: 'initialize',
    args: [account.address, RESOLVER_ALL_ROLES],
  })

  // Sanity checks that would otherwise show up only as an opaque revert.
  const factoryCode = await client.getBytecode({ address: VERIFIABLE_FACTORY })
  const implCode = await client.getBytecode({
    address: PERMISSIONED_RESOLVER_IMPL,
  })
  console.log(`Factory has code: ${Boolean(factoryCode)}`)
  console.log(`Implementation has code: ${Boolean(implCode)}`)
  if (!factoryCode || !implCode) {
    throw new Error(
      'One of the addresses above has no deployed code on this chain — ' +
        'wrong address, or wrong network. Not a revert, a bad address.',
    )
  }

  // Calling a plain view function directly on the implementation (not
  // through a proxy) rules out "PERMISSIONED_RESOLVER_IMPL is the wrong
  // address" as a cause: if this address doesn't actually speak the
  // Permissioned Resolver ABI, this read fails differently than the
  // deployProxy revert below, which narrows things down.
  try {
    const recordVersion = await client.readContract({
      address: PERMISSIONED_RESOLVER_IMPL,
      abi: permissionedResolverAbi,
      functionName: 'recordVersions',
      args: [zeroHash],
    })
    console.log(
      `Implementation responds to recordVersions() as expected: ${recordVersion}\n`,
    )
  } catch (readErr) {
    console.error(
      '\nImplementation address does not behave like a Permissioned',
      'Resolver — recordVersions() read failed:',
    )
    console.error(readErr.shortMessage || readErr.message)
    throw readErr
  }

  console.log('Deploying shared Permissioned Resolver proxy...')
  // simulateContract runs the call first via eth_call, which surfaces the
  // actual revert reason — writeContract alone often reports only "reverted"
  // with no detail, because it's not simulated against the ABI first.
  try {
    await client.simulateContract({
      account,
      address: VERIFIABLE_FACTORY,
      abi: verifiableFactoryAbi,
      functionName: 'deployProxy',
      args: [PERMISSIONED_RESOLVER_IMPL, resolverSalt, resolverInitData],
    })
  } catch (simErr) {
    console.error('\nSimulation failed — this is the real reason:')
    console.error(simErr.shortMessage || simErr.message)
    if (simErr.metaMessages) console.error(simErr.metaMessages.join('\n'))
    if (simErr.cause) console.error('cause:', simErr.cause)
    throw simErr
  }

  const tx = await wallet.writeContract({
    address: VERIFIABLE_FACTORY,
    abi: verifiableFactoryAbi,
    functionName: 'deployProxy',
    args: [PERMISSIONED_RESOLVER_IMPL, resolverSalt, resolverInitData],
  })
  const receipt = await client.waitForTransactionReceipt({ hash: tx })
  console.log(`  deploy tx: ${tx}`)

  const [log] = parseEventLogs({
    abi: verifiableFactoryAbi,
    eventName: 'ProxyDeployed',
    logs: receipt.logs,
  })
  const resolverAddress = log.args.proxyAddress

  console.log(`\n✅ Shared resolver deployed: ${resolverAddress}`)
  console.log('\nUse this as the `resolver` argument when calling')
  console.log(
    'SaporeChefRegistrar.register(label, chefWallet, resolverAddress).',
  )
  console.log(
    `\nAdd SHARED_RESOLVER=${resolverAddress} to .env, then run\n` +
      '03-authorize-chef.mjs <alias> <chefWallet> once a Chef has registered,\n' +
      'to delegate that Chef write access to only their own name.',
  )
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.shortMessage || err.message || err)
  process.exit(1)
})
