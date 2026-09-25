/**
 * ensRecords.ts — re-exports @sapore-pay/ens's writeChefRecords().
 *
 * The implementation moved to the shared package so apps/service (which
 * signs these writes today, with Sapore's own backend key — see
 * docs/engineering-log.md and recordWriter.ts) and apps/web (which will
 * call it directly once Privy wires a real wallet client into the browser,
 * with a Chef's own key signing instead) both use the exact same function
 * rather than two copies drifting apart. Re-exported here, not just
 * imported directly by recordWriter.ts, so nothing else in apps/web needs
 * to change its import path.
 */
export {
  type ChefRecords,
  type WriteRecordsOutcome,
  writeChefRecords,
} from '@sapore-pay/ens'
