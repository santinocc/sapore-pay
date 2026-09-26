/**
 * chefRecords.ts — writing a Chef's payout and profile records once their
 * `<alias>.sapore.eth` resolver exists.
 *
 * Lives in @sapore-pay/ens rather than either app because both need it:
 * apps/service calls it today (signing with Sapore's own backend key, since
 * apps/web has no embedded wallet yet — see docs/engineering-log.md), and
 * apps/web will call it directly once Privy wires a real wallet client into
 * the browser, with a Chef's own key signing instead. Same function either
 * way; only which WalletClient gets passed in changes.
 *
 * ENSv2's "For App Developers" guide is explicit that "the setter functions
 * themselves are unchanged from ENSv1's public resolver interface" — so
 * `setAddr`/`setText`/`multicall` below are the actual, long-stable ENS
 * resolver ABI, not a guess. What's ENSv2-specific is finding the RIGHT
 * resolver (each account gets its own instance now, there's no shared
 * Public Resolver to assume) and who's authorized to write to it (Enhanced
 * Access Control roles) — both handled below, per the guide's "Find the
 * Resolver" / "Who Can Write" sections.
 *
 * `setAddr(node, address)` is the ENSIP-9 default (coinType 60 / ETH
 * mainnet-shaped addresses — what every wallet reads first). The second
 * `setAddr(node, coinType, bytes)` overload is ENSIP-9's multicoin profile,
 * used here for Tempo's ENSIP-11 coin type — an EVM chain, so its address is
 * the same 20-byte shape, just tagged with a different coinType so a
 * Tempo-aware client resolves the right one.
 */

import {
  type Address,
  encodeFunctionData,
  type PublicClient,
  parseAbi,
  type WalletClient,
} from 'viem'
import { namehash, normalize } from 'viem/ens'
import { evmCoinType } from './coinType.js'

/** Matches the app-wide TEMPO_CHAIN_ID assumption (see each app's .env.example). */
const TEMPO_CHAIN_ID = 42431
const TEMPO_COIN_TYPE = evmCoinType(TEMPO_CHAIN_ID)

const resolverAbi = parseAbi([
  'function setAddr(bytes32 node, address addr_)',
  'function setAddr(bytes32 node, uint256 coinType, bytes value)',
  'function setText(bytes32 node, string key, string value)',
  'function multicall(bytes[] data) returns (bytes[])',
])

export interface ChefRecords {
  /** Written to both addr(60) and addr(ENSIP-11 Tempo coinType). */
  payoutAddress: Address
  tier?: string
  verified?: boolean
}

export type WriteRecordsOutcome =
  | { status: 'written'; txHash: string; resolver: Address }
  /** No resolver set on this name yet — subname exists but is unclaimed-in-full. */
  | { status: 'no_resolver' }
  /**
   * The connected wallet holds no roles on this resolver — almost always a
   * subname owner writing to the parent's shared resolver instead of their
   * own. Named for the guide's actual revert, not a generic "denied".
   */
  | { status: 'unauthorized' }
  | { status: 'error'; message: string }

/**
 * Writes a Chef's payout address and profile text as one transaction via the
 * resolver's multicall, so a partial write (address set, tier not) can't
 * happen.
 *
 * Always looks the resolver up fresh rather than accepting one as a
 * parameter — the guide's own warning: "A name's resolver pointer can change
 * at any time, and writing to a resolver a name no longer uses silently
 * updates records nobody reads."
 */
// A registration another RPC node (or another provider entirely — see
// privyWallet.ts's comment on VITE_SEPOLIA_RPC_URL) just confirmed isn't
// guaranteed to be visible on the very next read against this client's own
// node: public RPC endpoints load-balance across multiple backend nodes
// that don't all advance in perfect lockstep. A few short retries absorb
// that normal propagation jitter instead of reporting a real name as
// falsely unclaimed the instant a claim-then-write flow runs back to back.
const RESOLVER_LOOKUP_RETRIES = 3
const RESOLVER_LOOKUP_RETRY_DELAY_MS = 1200

export async function writeChefRecords(
  publicClient: PublicClient,
  walletClient: WalletClient,
  fullName: string,
  records: ChefRecords,
): Promise<WriteRecordsOutcome> {
  const name = normalize(fullName)
  const node = namehash(name)

  let resolver: Address | null
  try {
    resolver = await lookupResolverWithRetries(publicClient, name)
  } catch (err) {
    return { status: 'error', message: (err as Error).message }
  }
  if (!resolver || resolver === '0x0000000000000000000000000000000000000000') {
    return { status: 'no_resolver' }
  }

  const calls = [
    { functionName: 'setAddr', args: [node, records.payoutAddress] as const },
    {
      functionName: 'setAddr',
      args: [node, BigInt(TEMPO_COIN_TYPE), records.payoutAddress] as const,
    },
  ] as const

  const encoded = calls.map((c) => encodeResolverCall(c.functionName, c.args))
  if (records.tier) {
    encoded.push(
      encodeResolverCall('setText', [node, 'com.sapore.tier', records.tier]),
    )
  }
  if (records.verified !== undefined) {
    encoded.push(
      encodeResolverCall('setText', [
        node,
        'com.sapore.verified',
        String(records.verified),
      ]),
    )
  }

  try {
    const [account] = await walletClient.getAddresses()
    const txHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: resolver,
      abi: resolverAbi,
      functionName: 'multicall',
      args: [encoded],
    })
    await publicClient.waitForTransactionReceipt({ hash: txHash })
    return { status: 'written', txHash, resolver }
  } catch (err) {
    const message = (err as Error).message ?? String(err)
    if (message.includes('EACUnauthorizedAccountRoles')) {
      return { status: 'unauthorized' }
    }
    return { status: 'error', message }
  }
}

function encodeResolverCall(
  functionName: 'setAddr' | 'setText',
  args: readonly unknown[],
): `0x${string}` {
  return encodeFunctionData({ abi: resolverAbi, functionName, args } as never)
}

async function lookupResolverWithRetries(
  publicClient: PublicClient,
  name: string,
): Promise<Address | null> {
  for (let attempt = 1; attempt <= RESOLVER_LOOKUP_RETRIES; attempt++) {
    const resolver = (await publicClient.getEnsResolver({
      name,
    })) as Address | null
    if (resolver && resolver !== '0x0000000000000000000000000000000000000000') {
      return resolver
    }
    if (attempt < RESOLVER_LOOKUP_RETRIES) {
      await new Promise((resolve) =>
        setTimeout(resolve, RESOLVER_LOOKUP_RETRY_DELAY_MS),
      )
    }
  }
  return null
}
