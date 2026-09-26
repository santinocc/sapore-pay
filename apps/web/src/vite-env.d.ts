/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVICE_URL?: string
  readonly VITE_PRIVY_APP_ID?: string
  readonly VITE_SEPOLIA_RPC_URL?: string
  readonly VITE_ENS_REGISTRY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
