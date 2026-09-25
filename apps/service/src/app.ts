import express, { type Express } from 'express'
import { createEnsChefClient } from './chain/ensChef.js'
import type { Config } from './config.js'

export function createApp(config: Config): Express {
  const app = express()
  app.use(express.json({ limit: '256kb' }))

  const ensChef = createEnsChefClient(config)

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'sapore-pay' })
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
  // until Privy wires a real wallet client into the browser.
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
