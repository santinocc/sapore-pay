import { PrivyProvider } from '@privy-io/react-auth'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { sepolia } from 'viem/chains'
import { App } from './App.js'
import { PRIVY_APP_ID } from './lib/privyWallet.js'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
createRoot(root).render(
  <StrictMode>
    {/* appId falls back to a placeholder so the SDK initializes (and fails
        gracefully into an error state, surfaced by useChefWallet) instead
        of the hooks throwing outside a provider when unconfigured. */}
    <PrivyProvider
      appId={PRIVY_APP_ID || 'unconfigured'}
      config={{
        loginMethods: ['email'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
        defaultChain: sepolia,
        supportedChains: [sepolia],
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>,
)
