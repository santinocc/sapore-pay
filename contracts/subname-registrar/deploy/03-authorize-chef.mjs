/**
 * 03-authorize-chef.mjs — delegates ONE Chef write access to ONLY their own
 * name on the shared resolver (02-deploy-shared-resolver.mjs's output).
 *
 * This is the piece 02's own comments flagged as "not yet wired": until this
 * runs for a given Chef, Sapore's admin key is the only account that can
 * write records for `<alias>.sapore.eth` — real, but not the end state. The
 * "Permissioned Resolver" doc's "Delegating a Single Text Key" example is
 * the source for the exact call shape used here (DNS-encoded name, not a
 * namehash, as the first argument to every `authorize*Roles` function).
 *
 * Granted roles are deliberately just ROLE_SET_ADDR | ROLE_SET_TEXT — the
 * two record types apps/web/src/lib/ensRecords.ts's writeChefRecords()
 * actually writes (addr(60), addr(Tempo), com.sapore.tier,
 * com.sapore.verified). Not ROLE_SET_CONTENTHASH, ROLE_SET_NAME,
 * ROLE_SET_ABI, etc. — same "minimum sufficient" reasoning as the World ID
 * credential and SaporeChefRegistrar's own narrower role bitmap: a Chef
 * gets exactly the write access their payout flow needs, nothing a
 * compromised Chef wallet could use to do anything else on this resolver.
 * And it's name-scoped (authorizeNameRoles, not a ROOT_RESOURCE grant) — a
 * Chef can only ever write their own name's records, never another Chef's.
 *
 * Run once per Chef, after SaporeChefRegistrar.register() has created their
 * subname (step 3/4 in ../README.md) — this script doesn't create the name,
 * only delegates who can write its records.
 *
 * Usage:
 *   node 03-authorize-chef.mjs <alias> <chefWalletAddress>
 * Requires SHARED_RESOLVER in .env (02's printed output) alongside the same
 * ENS_OWNER_PRIVATE_KEY used in steps 1-2 (the resolver admin key).
 */

import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  toHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { packetToBytes } from 'viem/ens'

const PRIVATE_KEY = requireEnv('ENS_OWNER_PRIVATE_KEY')
const SHARED_RESOLVER = requireEnv('SHARED_RESOLVER')
const RPC_URL =
  process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'

const [alias, chefAddress] = process.argv.slice(2)
if (!alias || !chefAddress) {
  console.error('Usage: node 03-authorize-chef.mjs <alias> <chefWalletAddress>')
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

const permissionedResolverAbi = parseAbi([
  'function authorizeNameRoles(bytes toName, uint256 roleBitmap, address account, bool grant)',
])

// Only the two record types writeChefRecords() actually sets.
const ROLE_SET_ADDR = 1n << 0n
const ROLE_SET_TEXT = 1n << 4n
const CHEF_RECORD_ROLES = ROLE_SET_ADDR | ROLE_SET_TEXT

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

  const fullName = `${alias.trim().toLowerCase()}.sapore.eth`
  const dnsName = toHex(packetToBytes(fullName))

  console.log(`Resolver admin (this script's signer): ${account.address}`)
  console.log(`Delegating on:                         ${SHARED_RESOLVER}`)
  console.log(`Name:                                  ${fullName}`)
  console.log(`Chef wallet (grantee):                 ${chefAddress}\n`)

  console.log('Simulating authorizeNameRoles...')
  await client.simulateContract({
    account,
    address: SHARED_RESOLVER,
    abi: permissionedResolverAbi,
    functionName: 'authorizeNameRoles',
    args: [dnsName, CHEF_RECORD_ROLES, chefAddress, true],
  })

  const tx = await wallet.writeContract({
    address: SHARED_RESOLVER,
    abi: permissionedResolverAbi,
    functionName: 'authorizeNameRoles',
    args: [dnsName, CHEF_RECORD_ROLES, chefAddress, true],
  })
  await client.waitForTransactionReceipt({ hash: tx })

  console.log(`  authorize tx: ${tx}`)
  console.log(
    `\n✅ ${chefAddress} can now call setAddr/setText for ${fullName} only.`,
  )
  console.log('Revoke the same way with the fourth argument set to `false`.')
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.shortMessage || err.message || err)
  process.exit(1)
})
