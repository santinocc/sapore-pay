/**
 * 01-deploy-user-registry.mjs — deploys a UserRegistry proxy for
 * `sapore.eth`'s Chef subnames, via ENSv2's Verifiable Factory, then points
 * `sapore.eth` at it.
 *
 * ONE-TIME DEPLOY SCRIPT. Not part of the pnpm workspace, run once, locally
 * — same reasoning as sapore/scripts/register-sepolia-ens: this is calling
 * already-deployed protocol contracts, not compiling anything, so it's
 * plain viem rather than Foundry.
 *
 * What this does NOT do: deploy SaporeChefRegistrar.sol itself (that's a new
 * contract — needs Foundry, see ../README.md) or grant it any roles (a
 * separate step, once it's deployed, since we need its address first).
 *
 * Usage:
 *   npm install
 *   cp .env.example .env    # paste in the key that owns sapore.eth
 *   node 01-deploy-user-registry.mjs
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
  toHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { namehash } from 'viem/ens'

// From ENSv2's Deployments (Sepolia) table, read 2026-09-25 — see
// sapore/scripts/register-sepolia-ens for the other two addresses from the
// same table (ETHRegistrar, MockUSDC). Override via env if these move.
const VERIFIABLE_FACTORY =
  process.env.ENS_VERIFIABLE_FACTORY ||
  '0xD2a632D8a8b67c2c4398c255CbD7aF8dd7236198'
const USER_REGISTRY_IMPL =
  process.env.ENS_USER_REGISTRY_IMPL ||
  '0x0F99e7Ea74903AfCB7224d0354fD7428A6f92917'
const ETH_REGISTRY =
  process.env.ENS_ETH_REGISTRY || '0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67'

const PARENT_LABEL = 'sapore' // sapore.eth — the label only, per setSubregistry's convention
const PARENT_NAME = 'sapore.eth'

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

const registryInitAbi = parseAbi([
  'function initialize(address rootAccount, uint256 roleBitmap)',
])

const permissionedRegistryAbi = parseAbi([
  'function setSubregistry(uint256 anyId, address subregistry)',
])

// "Grant all roles and their admin counterparts" — verbatim from ENSv2's own
// Verifiable Factory doc example. We hold this over OUR OWN UserRegistry as
// its trusted operator; it is not what we grant to Chefs (see
// CHEF_REGISTRATION_ROLE_BITMAP in SaporeChefRegistrar.sol, which is
// deliberately much narrower).
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

  console.log(`Deployer: ${account.address}`)
  console.log(`Parent name: ${PARENT_NAME}\n`)

  // ── 1. Deploy the UserRegistry proxy ────────────────────────────────────
  // Salt scheme per the Verifiable Factory doc: keccak256("UserRegistry",
  // namehash(name), version) — one registry per name, deterministic.
  const version = 0n
  const registrySalt = BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }],
        [
          keccak256(stringToHex('UserRegistry')),
          namehash(PARENT_NAME),
          version,
        ],
      ),
    ),
  )

  const registryInitData = encodeFunctionData({
    abi: registryInitAbi,
    functionName: 'initialize',
    args: [account.address, ALL_ROLES],
  })

  console.log('Deploying UserRegistry proxy...')
  const deployTx = await wallet.writeContract({
    address: VERIFIABLE_FACTORY,
    abi: verifiableFactoryAbi,
    functionName: 'deployProxy',
    args: [USER_REGISTRY_IMPL, registrySalt, registryInitData],
  })
  const deployReceipt = await client.waitForTransactionReceipt({
    hash: deployTx,
  })
  console.log(`  deploy tx: ${deployTx}`)

  const [deployLog] = parseEventLogs({
    abi: verifiableFactoryAbi,
    eventName: 'ProxyDeployed',
    logs: deployReceipt.logs,
  })
  const registryAddress = deployLog.args.proxyAddress
  console.log(`  UserRegistry proxy: ${registryAddress}\n`)

  // ── 2. Point sapore.eth at it ────────────────────────────────────────────
  // Without this, Chef subnames register (mint a token) but never resolve —
  // the Universal Resolver only walks registries it can reach from the root
  // via getSubregistry(), and until this call sapore.eth has none.
  console.log(`Pointing ${PARENT_NAME} at the new UserRegistry...`)
  const anyId = BigInt(keccak256(toHex(PARENT_LABEL)))
  const subregistryTx = await wallet.writeContract({
    address: ETH_REGISTRY,
    abi: permissionedRegistryAbi,
    functionName: 'setSubregistry',
    args: [anyId, registryAddress],
  })
  await client.waitForTransactionReceipt({ hash: subregistryTx })
  console.log(`  setSubregistry tx: ${subregistryTx}\n`)

  console.log('✅ Done.')
  console.log(`   UserRegistry: ${registryAddress}`)
  console.log(
    '\nNext: deploy SaporeChefRegistrar.sol via Foundry (see ../README.md),',
  )
  console.log(
    `passing ${registryAddress} as its constructor's registry argument,`,
  )
  console.log('then grant it ROLE_REGISTRAR on this UserRegistry.')
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.shortMessage || err.message || err)
  process.exit(1)
})
