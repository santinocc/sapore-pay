import { verifyWorldProof } from '@sapore-pay/world'
import cors from 'cors'
import express, { type Express } from 'express'
import { createEnsChefClient } from './chain/ensChef.js'
import type { Config } from './config.js'

export function createApp(config: Config): Express {
  const app = express()
  const allowedOrigins = config.WEB_ORIGIN.split(',').map((o) => o.trim())
  app.use(cors({ origin: allowedOrigins }))
  app.use(express.json({ limit: '256kb' }))

  const ensChef = createEnsChefClient(config)

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'sapore-pay' })
  })

  // The trust decision for "is this a unique human", made here and never in
  // the browser. apps/web's IDKit widget produces the proof; this route is
  // what asks World whether it's real. Unlike the ENS routes below, this one
  // needs no auth to be safe: a caller can't forge a World proof, and a
  // replayed one is bound to its original `signal` — the worst a stranger
  // hitting this endpoint achieves is being told their own proof is valid.
  app.post('/world/verify', async (req, res) => {
    const { signal, proof } = req.body ?? {}
    if (typeof signal !== 'string' || !proof || typeof proof !== 'object') {
      res.status(400).json({ message: 'signal and proof are required.' })
      return
    }
    const outcome = await verifyWorldProof({
      appId: config.WORLD_APP_ID,
      action: config.WORLD_ACTION,
      signal,
      proof,
    })
    res.json(outcome)
  })

  // Backs apps/web's createOnChainSubnameClaimer — see its doc comment for
  // why registration has to happen here, not in the browser.
  app.get('/ens/chef/:label/availability', async (req, res) => {
    try {
      const available = await ensChef.isAvailable(req.params.label)
      res.json({ available })
    } catch (err) {
      res.status(502).json({ message: (err as Error).message })
    }
  })

  // No auth on this route yet — anyone who can reach this service can
  // register any available alias to any address, for free, right now.
  // Real gating (World ID verified + the caller owns `ownerAddress`, via
  // the wallet-login session from docs/sapore-api-contract.md's Auth
  // section) is real scope, not a one-line fix, and isn't built yet.
  // Known, not hidden — CORS only stops browser JS from other origins,
  // it was never protection against this.
  app.post('/ens/chef/claim', async (req, res) => {
    const { label, ownerAddress } = req.body ?? {}
    if (typeof label !== 'string' || typeof ownerAddress !== 'string') {
      res.status(400).json({ message: 'label and ownerAddress are required.' })
      return
    }
    const outcome = await ensChef.claim(label, ownerAddress as `0x${string}`)
    res.json(outcome)
  })

  // Backs apps/web's createOnChainRecordWriter — see its doc comment for
  // why this is backend-signed (Sapore's own key) rather than the Chef's,
  // until Privy wires a real wallet client into the browser. Same missing-
  // auth caveat as /ens/chef/claim above: the backend key holds
  // ROOT_RESOURCE roles on the resolver, so it can write any name's
  // records right now, not just the caller's own.
  app.post('/ens/chef/records', async (req, res) => {
    const { fullName, payoutAddress, tier, verified } = req.body ?? {}
    if (typeof fullName !== 'string' || typeof payoutAddress !== 'string') {
      res
        .status(400)
        .json({ message: 'fullName and payoutAddress are required.' })
      return
    }
    const outcome = await ensChef.writeRecords(fullName, {
      payoutAddress: payoutAddress as `0x${string}`,
      tier: typeof tier === 'string' ? tier : undefined,
      verified: typeof verified === 'boolean' ? verified : undefined,
    })
    res.json(outcome)
  })

  // Hackathon work continues here: POST /orders, GET /orders/:id, indexer,
  // payout scheduler, World ID verify. One route per commit.

  return app
}
