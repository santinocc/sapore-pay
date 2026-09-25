import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/sapore-pay'),
  SERVICE_API_KEY: z.string().default(''),
  WEBHOOK_SECRET: z.string().default(''),
  WEBHOOK_URL: z.string().default('http://localhost:3001/webhooks/pay'),
  SAPORE_JWKS_URL: z
    .string()
    .default('http://localhost:3001/.well-known/jwks.json'),
  SAPORE_JWT_ISSUER: z.string().default('sapore'),
})

export type Config = z.infer<typeof schema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env)
}
