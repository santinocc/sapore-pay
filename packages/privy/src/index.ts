/**
 * Privy glue — implemented during the hackathon.
 *
 * Superseded direction, kept here as history: this package originally
 * planned "custom auth" — Privy verifying Sapore's own RS256 tokens
 * against its JWKS, so an existing Sapore login could also get a wallet.
 * That presumed Sapore had its own login system worth trusting.
 *
 * Current direction (see docs/sapore-api-contract.md's "Auth" section):
 * reversed. Sapore is crypto-only, so there's no separate login system —
 * Privy's own SIWE-signed wallet login *is* the login, for Cooker and
 * Chef alike. Sapore verifies Privy's signature, not the other way
 * around, via POST /auth/wallet-login in the private repo.
 *
 * Planned: server-wallet signer for the escrow/treasury with destination
 * allowlists — unrelated to the auth question above, still needed either
 * way.
 */
export {}
