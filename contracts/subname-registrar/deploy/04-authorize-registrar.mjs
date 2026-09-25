/**
 * 04-authorize-registrar.mjs — grants SaporeChefRegistrar.sol ROLE_REGISTRAR
 * on the UserRegistry, so it can actually mint `<alias>.sapore.eth` subnames.
 *
 * Without this, SaporeChefRegistrar.register() would revert every time it
 * calls REGISTRY.register() internally — holding ROLE_REGISTRAR on the
 * registry is what lets it register names at all, separate from (and in
 * addition to) the BACKEND check inside SaporeChefRegistrar itself that
 * controls who can call *it*.
 *
 * grantRootRoles(roleBitmap, account) and ROLE_REGISTRAR's bit value (1<<0)
 * are both confirmed against verified Sepolia source
 * (EnhancedAccessControl.sol / IEnhancedAccessControl.sol / RegistryRolesLib.sol)
 * — see docs/engineering-log.md.
 *
 * Usage: node 04-authorize-registrar.mjs <registrarAddress>
 */

import 'dotenv/config'
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const USER_REGISTRY =
  process.env.ENS_USER_REGISTRY || '0x9a932e911c7FD7DfD54d1B11Ef4fE0c9aa46862d'

const PRIVATE_KEY = requireEnv('ENS_OWNER_PRIVATE_KEY')
const RPC_URL =
  process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'

const [registrarAddress] = process.argv.slice(2)
if (!registrarAddress) {
  console.error('Usage: node 04-authorize-registrar.mjs <registrarAddress>')
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

const enhancedAccessControlAbi = parseAbi([
  'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
])

// Not ROLE_REGISTRAR_ADMIN — the registrar needs to call register(), not
// delegate ROLE_REGISTRAR to anyone else. Not ROLE_RENEW either —
// SaporeChefRegistrar has no renew() (see its own doc comment for why).
const ROLE_REGISTRAR = 1n << 0n

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

  console.log(`Registry admin (this script's signer): ${account.address}`)
  console.log(`UserRegistry:                           ${USER_REGISTRY}`)
  console.log(`Granting ROLE_REGISTRAR to:              ${registrarAddress}\n`)

  console.log('Simulating grantRootRoles...')
  await client.simulateContract({
    account,
    address: USER_REGISTRY,
    abi: enhancedAccessControlAbi,
    functionName: 'grantRootRoles',
    args: [ROLE_REGISTRAR, registrarAddress],
  })

  const tx = await wallet.writeContract({
    address: USER_REGISTRY,
    abi: enhancedAccessControlAbi,
    functionName: 'grantRootRoles',
    args: [ROLE_REGISTRAR, registrarAddress],
  })
  await client.waitForTransactionReceipt({ hash: tx })

  console.log(`  grantRootRoles tx: ${tx}`)
  console.log(
    `\n✅ ${registrarAddress} now holds ROLE_REGISTRAR on ${USER_REGISTRY}.`,
  )
  console.log(
    'Next: call SaporeChefRegistrar.isAvailable(label) / .register(label, chefWallet, resolverAddress)\n' +
      'to actually register a Chef, then 03-authorize-chef.mjs to delegate their write access.',
  )
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.shortMessage || err.message || err)
  process.exit(1)
})
