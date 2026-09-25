/**
 * privyWallet.ts — turning Privy's embedded wallet into a viem WalletClient
 * a Chef can sign with.
 *
 * This is standalone Privy login (email), not the "custom auth" pattern
 * `packages/privy`'s own scaffold plans (Privy trusting an existing Sapore
 * JWT) — that presumes a Sapore login this isolated demo doesn't have, and
 * the SIWE handoff to a real Sapore account (`POST /auth/wallet-login`)
 * lives in the private repo, marked "thin glue; not judged" in
 * docs/sapore-api-contract.md. What the ENS/World prize criteria actually
 * judge — a real wallet signing real transactions — doesn't need either.
 *
 * `getEmbeddedConnectedWallet` and `Chain` accepting a plain viem chain
 * object (`sepolia` from `viem/chains`) are both confirmed against Privy's
 * installed type declarations, not assumed from memory — see
 * docs/engineering-log.md.
 */

import {
  getEmbeddedConnectedWallet,
  usePrivy,
  useWallets,
} from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { sepolia } from 'viem/chains'

export type ChefWalletState =
  | { status: 'loading' }
  | { status: 'logged_out' }
  /** Authenticated, but the account has no Privy embedded wallet (e.g. only linked an external one). */
  | { status: 'no_embedded_wallet' }
  | {
      status: 'ready'
      address: `0x${string}`
      walletClient: WalletClient
      publicClient: PublicClient
    }
  | { status: 'error'; message: string }

/**
 * Tracks Privy's auth/wallet state and, once an embedded wallet exists,
 * fetches its EIP-1193 provider and wraps it as a viem WalletClient — the
 * same shape @sapore-pay/ens's writeChefRecords() already expects, so
 * apps/service's backend-signed path and this one call the identical
 * function.
 */
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID ?? ''

export function useChefWallet(): ChefWalletState {
  const { ready, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const [state, setState] = useState<ChefWalletState>({ status: 'loading' })

  useEffect(() => {
    if (!PRIVY_APP_ID) {
      setState({
        status: 'error',
        message: 'Privy is not configured on this deployment.',
      })
      return
    }
    if (!ready) {
      setState({ status: 'loading' })
      return
    }
    if (!authenticated) {
      setState({ status: 'logged_out' })
      return
    }
    const embedded = getEmbeddedConnectedWallet(wallets)
    if (!embedded) {
      setState({ status: 'no_embedded_wallet' })
      return
    }

    let cancelled = false
    embedded
      .getEthereumProvider()
      .then((provider) => {
        if (cancelled) return
        const address = embedded.address as `0x${string}`
        setState({
          status: 'ready',
          address,
          walletClient: createWalletClient({
            account: address,
            chain: sepolia,
            transport: custom(provider),
          }),
          publicClient: createPublicClient({
            chain: sepolia,
            transport: http(),
          }),
        })
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ status: 'error', message: (err as Error).message })
        }
      })
    return () => {
      cancelled = true
    }
  }, [ready, authenticated, wallets])

  return state
}
