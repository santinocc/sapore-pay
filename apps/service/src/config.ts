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

  // ENSv2 Sepolia — see contracts/subname-registrar/README.md and
  // docs/engineering-log.md for how these were deployed and verified.
  // No default for the private key: routes that need it report
  // "not configured" rather than the service refusing to start, matching
  // how WORLD_APP_ID is handled.
  SEPOLIA_RPC_URL: z
    .string()
    .default('https://ethereum-sepolia-rpc.publicnode.com'),
  ENS_BACKEND_PRIVATE_KEY: z.string().default(''),
  ENS_CHEF_REGISTRAR: z
    .string()
    .default('0x45347E1a412a16f494d945Ed3402A773A07fc5D1'),
  ENS_SHARED_RESOLVER: z
    .string()
    .default('0x0356d23bcfBe2Cb42508542c930C7A2cCa352858'),
  // The ENSv2 UserRegistry holding sapore.eth's Chef subnames — distinct
  // from ENS_CHEF_REGISTRAR (SaporeChefRegistrar, the wrapper contract that
  // calls into this one). writeChefRecords() calls this registry's own
  // getResolver(label) directly to find a name's resolver; see
  // packages/ens/src/chefRecords.ts's doc comment for why (viem's built-in
  // getEnsResolver() doesn't support ENSv2 registries at all).
  ENS_REGISTRY: z
    .string()
    .default('0x9a932e911c7FD7DfD54d1B11Ef4fE0c9aa46862d'),

  // Comma-separated origins allowed to call this service from a browser.
  // Vite auto-increments past 5173 when the port's taken (5174, 5175, ...),
  // hence the range rather than one fixed port.
  WEB_ORIGIN: z
    .string()
    .default(
      'http://localhost:5173,http://localhost:5174,http://localhost:5175',
    ),
})

export type Config = z.infer<typeof schema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env)
}
