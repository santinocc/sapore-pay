/**
 * ensChef.ts — Sapore's backend-signed calls to the deployed ENSv2
 * contracts: checking alias availability, registering a Chef's
 * `<alias>.sapore.eth`, delegating their own write access, and writing
 * payout/profile records to their resolver.
 *
 * Every address and ABI shape here is a deployed, verified contract from
 * contracts/subname-registrar/ — see docs/engineering-log.md for the full
 * deploy and verification trail, including two real bugs found and fixed
 * before anything shipped. Nothing here is guessed.
 *
 * Signed with ENS_BACKEND_PRIVATE_KEY, the same address SaporeChefRegistrar
 * was deployed with as `backend` and the shared resolver's admin — the only
 * account that can call register() or delegate roles on the resolver.
 * apps/web never holds this key; it only ever talks to the routes built on
 * top of this module.
 */

import {
  type ChefRecords,
  type WriteRecordsOutcome,
  writeChefRecords,
} from '@sapore-pay/ens'
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  parseAbi,
  toHex,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { packetToBytes } from 'viem/ens'
import type { Config } from '../config.js'

const chefRegistrarAbi = parseAbi([
  'function isAvailable(string label) view returns (bool)',
  'function register(string label, address owner, address resolver) returns (uint256 tokenId)',
])

const permissionedResolverAbi = parseAbi([
  'function authorizeNameRoles(bytes toName, uint256 roleBitmap, address account, bool grant)',
])

// Only the two record types writeChefRecords() actually sets — same
// constant and reasoning as contracts/subname-registrar/deploy/03-authorize-chef.mjs.
const ROLE_SET_ADDR = 1n << 0n
const ROLE_SET_TEXT = 1n << 4n
const CHEF_RECORD_ROLES = ROLE_SET_ADDR | ROLE_SET_TEXT

const NOT_CONFIGURED = 'ENS backend is not configured on this deployment.'

export type ClaimResult =
  | { status: 'claimed'; fullName: string; txHash: string }
  | { status: 'taken'; fullName: string }
  | { status: 'error'; message: string }

export interface EnsChefClient {
  isAvailable(label: string): Promise<boolean>
  claim(label: string, ownerAddress: `0x${string}`): Promise<ClaimResult>
  writeRecords(
    fullName: string,
    records: ChefRecords,
  ): Promise<WriteRecordsOutcome>
}

/**
 * Never returns an unusable client — `isAvailable` (a plain read) always
 * works. `claim`/`writeRecords` report NOT_CONFIGURED if
 * ENS_BACKEND_PRIVATE_KEY isn't set, same principle as createWorldVerifier's
 * handling of an unset WORLD_APP_ID: an unconfigured deployment must say so,
 * not silently do nothing or crash at startup.
 */
export function createEnsChefClient(config: Config): EnsChefClient {
  const publicClient: PublicClient = createPublicClient({
    chain: sepolia,
    transport: http(config.SEPOLIA_RPC_URL),
  })
  const registrarAddress = config.ENS_CHEF_REGISTRAR as `0x${string}`
  const resolverAddress = config.ENS_SHARED_RESOLVER as `0x${string}`
  const registryAddress = config.ENS_REGISTRY as `0x${string}`

  const backendAccount = config.ENS_BACKEND_PRIVATE_KEY
    ? privateKeyToAccount(config.ENS_BACKEND_PRIVATE_KEY as `0x${string}`)
    : null
  const walletClient: WalletClient | null = backendAccount
    ? createWalletClient({
        account: backendAccount,
        chain: sepolia,
        transport: http(config.SEPOLIA_RPC_URL),
      })
    : null

  return {
    isAvailable: (label) =>
      publicClient.readContract({
        address: registrarAddress,
        abi: chefRegistrarAbi,
        functionName: 'isAvailable',
        args: [label],
      }),

    async claim(label, ownerAddress) {
      const fullName = `${label}.sapore.eth`
      if (!walletClient || !backendAccount) {
        return { status: 'error', message: NOT_CONFIGURED }
      }

      const available = await publicClient.readContract({
        address: registrarAddress,
        abi: chefRegistrarAbi,
        functionName: 'isAvailable',
        args: [label],
      })
      if (!available) return { status: 'taken', fullName }

      let txHash: `0x${string}`
      try {
        txHash = await walletClient.writeContract({
          account: backendAccount,
          chain: sepolia,
          address: registrarAddress,
          abi: chefRegistrarAbi,
          functionName: 'register',
          args: [label, ownerAddress, resolverAddress],
        })
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      } catch (err) {
        return { status: 'error', message: (err as Error).message }
      }

      // Delegate the Chef's own write access on their name — same call
      // 03-authorize-chef.mjs makes, run automatically at claim time so the
      // resolver side is ready the moment a Chef could sign their own
      // writes (once Privy exists). Not fatal if it fails: the name is
      // already registered, and Sapore's backend key can still write
      // records via its own ROOT_RESOURCE roles either way.
      try {
        const dnsName = toHex(packetToBytes(fullName))
        await walletClient.writeContract({
          account: backendAccount,
          chain: sepolia,
          address: resolverAddress,
          abi: permissionedResolverAbi,
          functionName: 'authorizeNameRoles',
          args: [dnsName, CHEF_RECORD_ROLES, ownerAddress, true],
        })
      } catch (err) {
        console.error(`Delegating write access for ${fullName} failed:`, err)
      }

      return { status: 'claimed', fullName, txHash }
    },

    async writeRecords(fullName, records) {
      if (!walletClient) return { status: 'error', message: NOT_CONFIGURED }
      return writeChefRecords(
        publicClient,
        walletClient,
        fullName,
        records,
        registryAddress,
      )
    },
  }
}
