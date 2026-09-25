/**
 * 05-register-chef.mjs — registers `<alias>.sapore.eth` for a Chef via the
 * deployed SaporeChefRegistrar, then reports the minted tokenId.
 *
 * This is step 5 in ../README.md — the first end-to-end exercise of the
 * whole pipeline (registry → resolver → registrar → a real Chef name).
 * Unlike the other scripts, SaporeChefRegistrar's ABI isn't inferred from
 * docs or Etherscan — it's compiled from ../src/SaporeChefRegistrar.sol,
 * which lives in this repo, so there's no interface to verify here.
 *
 * Must be signed by whichever address SaporeChefRegistrar's constructor set
 * as `backend` (register() reverts with Unauthorized() for anyone else) —
 * the same ENS_OWNER_PRIVATE_KEY used throughout, per ../README.md step 3's
 * deploy args.
 *
 * Usage: node 05-register-chef.mjs <alias> <chefWalletAddress>
 * Requires SHARED_RESOLVER in .env (02's output) — this passes it as
 * register()'s resolver argument so the name resolves immediately.
 */

import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEventLogs,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const CHEF_REGISTRAR =
  process.env.ENS_CHEF_REGISTRAR || '0x45347E1a412a16f494d945Ed3402A773A07fc5D1'

const PRIVATE_KEY = requireEnv('ENS_OWNER_PRIVATE_KEY')
const SHARED_RESOLVER = requireEnv('SHARED_RESOLVER')
const RPC_URL =
  process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'

const [alias, chefAddress] = process.argv.slice(2)
if (!alias || !chefAddress) {
  console.error('Usage: node 05-register-chef.mjs <alias> <chefWalletAddress>')
  process.exit(1)
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing ${name} — copy .env.example to .env and fill it in.`)
    process.exit(1)
  }
  return value
}

const chefRegistrarAbi = parseAbi([
  'function isAvailable(string label) view returns (bool)',
  'function register(string label, address owner, address resolver) returns (uint256 tokenId)',
  'event ChefNameRegistered(uint256 indexed tokenId, string label, address owner, uint256 price)',
])

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

  const label = alias.trim().toLowerCase()
  const fullName = `${label}.sapore.eth`

  console.log(`Backend (this script's signer): ${account.address}`)
  console.log(`SaporeChefRegistrar:            ${CHEF_REGISTRAR}`)
  console.log(`Resolver:                       ${SHARED_RESOLVER}`)
  console.log(`Registering:                    ${fullName}`)
  console.log(`For Chef wallet:                ${chefAddress}\n`)

  const available = await client.readContract({
    address: CHEF_REGISTRAR,
    abi: chefRegistrarAbi,
    functionName: 'isAvailable',
    args: [label],
  })
  console.log(`isAvailable("${label}"): ${available}`)
  if (!available) {
    console.error(`\n❌ ${fullName} is already taken. Pick a different alias.`)
    process.exit(1)
  }

  console.log('\nSimulating register...')
  await client.simulateContract({
    account,
    address: CHEF_REGISTRAR,
    abi: chefRegistrarAbi,
    functionName: 'register',
    args: [label, chefAddress, SHARED_RESOLVER],
  })

  const tx = await wallet.writeContract({
    address: CHEF_REGISTRAR,
    abi: chefRegistrarAbi,
    functionName: 'register',
    args: [label, chefAddress, SHARED_RESOLVER],
  })
  const receipt = await client.waitForTransactionReceipt({ hash: tx })
  console.log(`  register tx: ${tx}`)

  const [log] = parseEventLogs({
    abi: chefRegistrarAbi,
    eventName: 'ChefNameRegistered',
    logs: receipt.logs,
  })

  console.log(`\n✅ ${fullName} registered — tokenId ${log.args.tokenId}`)
  console.log(
    `\nNext: node 03-authorize-chef.mjs ${label} ${chefAddress}\n` +
      'to delegate write access, then apps/web can call writeChefRecords()\n' +
      `once ${chefAddress} holds a resolver client for ${fullName}.`,
  )
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.shortMessage || err.message || err)
  process.exit(1)
})
