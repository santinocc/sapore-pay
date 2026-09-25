/**
 * 02-deploy-shared-resolver.mjs — deploys ONE Permissioned Resolver proxy
 * that all Chef subnames point at, owned by Sapore.
 *
 * This is the "shared resolver + delegation" side of the decision recorded
 * in docs/engineering-log.md (the alternative being a separate resolver
 * deployed per Chef). One deployment total, not one per Chef.
 *
 * What this does NOT yet do: delegate a specific Chef write access to their
 * own node on this resolver. ENSv2's docs name the mechanism — "delegated
 * per name or per record key via the resolver's authorize*Roles functions"
 * — but the exact function signature is on the "Permissioned Resolver"
 * contract page, not yet read in this session. Until that's read, Sapore
 * (as this resolver's deployer/owner, holding ALL_ROLES) is the only account
 * that can call writeChefRecords() against it — which is a real, demoable
 * intermediate state (Sapore setting records on the Chef's behalf), just not
 * the end state the ENS card wants (the Chef writing their own).
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

const resolverInitAbi = parseAbi([
  'function initialize(address admin, uint256 roleBitmap, bytes[] setters)',
])

const ALL_ROLES =
  0x1111111111111111111111111111111111111111111111111111111111111111n

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
  const version = 0n
  const resolverSalt = BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }],
        [keccak256(stringToHex('OwnedResolver')), account.address, version],
      ),
    ),
  )

  const resolverInitData = encodeFunctionData({
    abi: resolverInitAbi,
    functionName: 'initialize',
    args: [account.address, ALL_ROLES, []],
  })

  console.log('Deploying shared Permissioned Resolver proxy...')
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
    '\nNot yet wired: delegating a specific Chef write access to only their\n' +
      'own node on this resolver (authorize*Roles) — needs the Permissioned\n' +
      'Resolver contract page, not yet read in this session.',
  )
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.shortMessage || err.message || err)
  process.exit(1)
})
