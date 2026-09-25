import express, { type Express } from 'express'
import type { Config } from './config.js'

export function createApp(_config: Config): Express {
  const app = express()
  app.use(express.json({ limit: '256kb' }))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'sapore-pay' })
  })

  // Hackathon work starts here: POST /orders, GET /orders/:id, indexer,
  // payout scheduler, ENS gateway, World ID verify. One route per commit.

  return app
}
