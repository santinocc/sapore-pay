/**
 * Sapore Pay — the public demo judges open.
 *
 * Built during ETHGlobal Tokyo 2026. The recipe marketplace it serves (Sapore)
 * is pre-existing and private; everything here is new.
 *
 * Flow: World ID chef onboarding -> claim <alias>.sapore.eth -> set payout
 * records. Each stage's own demo controls pick the outcome the next action
 * returns, so any state — including the rejection paths — is reachable on
 * purpose, not by breaking something live.
 *
 * The ENS claim and payout steps can each run in "Simulated" or
 * "Real (Sepolia)" mode. Real mode gates on a connected Privy wallet
 * (WalletConnect) first, since a real ownerAddress and a real signer for
 * writeChefRecords() both come from it. Simulated mode never needs a
 * wallet — its claimer/writer ignore ownerAddress entirely — so the wallet
 * gate only appears when it's actually needed, not as a mandatory first
 * step for everyone. Claiming itself still always goes through
 * apps/service (SaporeChefRegistrar.register() only accepts calls from its
 * deployed `backend` address); only payout records are Chef-signed
 * directly once a wallet exists. World ID stays simulated-only:
 * WORLD_APP_ID isn't configured yet.
 */

import { useMemo, useState } from 'react'
import {
  createOnChainSubnameClaimer,
  createSimulatedSubnameClaimer,
  type SimulatedClaimScenario,
} from './lib/ensClaim'
import {
  createSimulatedVerifier,
  type SimulatedScenario,
} from './lib/humanVerifier'
import type { ChefWalletState } from './lib/privyWallet'
import {
  createPrivyRecordWriter,
  createSimulatedRecordWriter,
  type SimulatedRecordScenario,
} from './lib/recordWriter'
import { ChefOnboarding } from './screens/ChefOnboarding'
import { EnsClaim } from './screens/EnsClaim'
import { PayoutRecords } from './screens/PayoutRecords'
import { WalletConnect } from './screens/WalletConnect'
import './theme.css'
import './app.css'

const SERVICE_URL = import.meta.env.VITE_SERVICE_URL ?? 'http://localhost:4000'

type ChefWallet = Extract<ChefWalletState, { status: 'ready' }>

type Step =
  | { kind: 'onboarding' }
  | { kind: 'ens-claim' }
  | { kind: 'payout'; fullName: string }

type Mode = 'simulated' | 'real'

const WORLD_SCENARIOS: { id: SimulatedScenario; label: string }[] = [
  { id: 'verified', label: 'Success' },
  { id: 'already_registered', label: 'Already a Chef' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'unavailable', label: 'No credential' },
  { id: 'error', label: 'Service error' },
]

const CLAIM_SCENARIOS: { id: SimulatedClaimScenario; label: string }[] = [
  { id: 'claimed', label: 'Available' },
  { id: 'taken', label: 'Taken' },
  { id: 'error', label: 'Tx error' },
]

const RECORD_SCENARIOS: { id: SimulatedRecordScenario; label: string }[] = [
  { id: 'written', label: 'Success' },
  { id: 'no_resolver', label: 'No resolver' },
  { id: 'unauthorized', label: 'Unauthorized' },
  { id: 'error', label: 'Tx error' },
]

export function App() {
  const [step, setStep] = useState<Step>({ kind: 'onboarding' })
  const [chefWallet, setChefWallet] = useState<ChefWallet | null>(null)

  const [worldScenario, setWorldScenario] =
    useState<SimulatedScenario>('verified')
  const [worldRun, setWorldRun] = useState(0)
  const worldVerifier = useMemo(
    () => createSimulatedVerifier(worldScenario),
    [worldScenario],
  )

  const [claimMode, setClaimMode] = useState<Mode>('simulated')
  const [claimScenario, setClaimScenario] =
    useState<SimulatedClaimScenario>('claimed')
  const [claimRun, setClaimRun] = useState(0)
  const claimer = useMemo(
    () =>
      claimMode === 'real'
        ? createOnChainSubnameClaimer({ serviceUrl: SERVICE_URL })
        : createSimulatedSubnameClaimer(claimScenario),
    [claimMode, claimScenario],
  )

  const [recordMode, setRecordMode] = useState<Mode>('simulated')
  const [recordScenario, setRecordScenario] =
    useState<SimulatedRecordScenario>('written')
  const [recordRun, setRecordRun] = useState(0)
  const recordWriter = useMemo(() => {
    if (recordMode === 'real' && chefWallet) {
      return createPrivyRecordWriter(
        chefWallet.publicClient,
        chefWallet.walletClient,
      )
    }
    return createSimulatedRecordWriter(recordScenario)
  }, [recordMode, recordScenario, chefWallet])

  const claimNeedsWallet = step.kind === 'ens-claim' && claimMode === 'real'
  const recordNeedsWallet = step.kind === 'payout' && recordMode === 'real'
  const needsWallet = (claimNeedsWallet || recordNeedsWallet) && !chefWallet

  return (
    <div className="shell">
      <header className="shell__head">
        <span className="shell__mark">SAPORE</span>
        <span className="shell__sub">PAY</span>
      </header>

      <nav className="steps" aria-label="Chef onboarding progress">
        <StepDot
          active={step.kind === 'onboarding'}
          done={step.kind !== 'onboarding'}
          label="World ID"
        />
        <StepDot
          active={step.kind === 'ens-claim'}
          done={step.kind === 'payout'}
          label="Claim name"
        />
        <StepDot active={step.kind === 'payout'} done={false} label="Payout" />
      </nav>

      <main className="shell__main">
        {step.kind === 'onboarding' && (
          <ChefOnboarding
            key={`world-${worldScenario}-${worldRun}`}
            verifier={worldVerifier}
            accountId="demo-cooker-0x01"
            onClaimEns={() => setStep({ kind: 'ens-claim' })}
          />
        )}
        {needsWallet && <WalletConnect onReady={setChefWallet} />}
        {step.kind === 'ens-claim' && !needsWallet && (
          <EnsClaim
            // Deliberately not keyed on claimMode: switching Simulated <->
            // Real shouldn't wipe an alias you already typed. claimScenario
            // + claimRun still force a fresh run for explicit chip clicks.
            key={`claim-${claimScenario}-${claimRun}`}
            claimer={claimer}
            ownerAddress={
              claimMode === 'real' && chefWallet
                ? chefWallet.address
                : '0x0d9f3D27e8F4EEBC80e445a59dAD5A9173d951ab'
            }
            onClaimed={(fullName) => setStep({ kind: 'payout', fullName })}
          />
        )}
        {step.kind === 'payout' && !needsWallet && (
          <PayoutRecords
            key={`records-${recordScenario}-${recordRun}`}
            writer={recordWriter}
            fullName={step.fullName}
          />
        )}
      </main>

      <aside className="demo" aria-label="Demo controls">
        <p className="demo__title">
          Demo controls —{' '}
          {step.kind === 'onboarding'
            ? 'World ID'
            : step.kind === 'ens-claim'
              ? 'ENS claim'
              : 'payout records'}
          <span className="demo__note">
            {step.kind === 'onboarding' &&
              'World ID is simulated until the app id is configured.'}
            {step.kind === 'ens-claim' &&
              (claimMode === 'real'
                ? `Calls ${SERVICE_URL} — a real SaporeChefRegistrar.register() on ENSv2 Sepolia, signed by Sapore's backend, for your connected wallet's address.`
                : 'Simulated. Switch to Real (Sepolia) to hit the deployed SaporeChefRegistrar.')}
            {step.kind === 'payout' &&
              (recordMode === 'real'
                ? 'A real writeChefRecords() on ENSv2 Sepolia, signed directly by your connected Privy wallet.'
                : 'Simulated. Switch to Real (Sepolia) to write real resolver records with your own wallet.')}
          </span>
        </p>
        {step.kind === 'ens-claim' && (
          <ModeToggle
            mode={claimMode}
            onChange={(m) => {
              setClaimMode(m)
              setClaimRun((n) => n + 1)
            }}
          />
        )}
        {step.kind === 'payout' && (
          <ModeToggle
            mode={recordMode}
            onChange={(m) => {
              setRecordMode(m)
              setRecordRun((n) => n + 1)
            }}
          />
        )}
        <div className="demo__row">
          {step.kind === 'onboarding' &&
            WORLD_SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`demo__chip${worldScenario === s.id ? ' is-active' : ''}`}
                aria-pressed={worldScenario === s.id}
                onClick={() => {
                  setWorldScenario(s.id)
                  setWorldRun((n) => n + 1)
                }}
              >
                {s.label}
              </button>
            ))}
          {step.kind === 'ens-claim' &&
            claimMode === 'simulated' &&
            CLAIM_SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`demo__chip${claimScenario === s.id ? ' is-active' : ''}`}
                aria-pressed={claimScenario === s.id}
                onClick={() => {
                  setClaimScenario(s.id)
                  setClaimRun((n) => n + 1)
                }}
              >
                {s.label}
              </button>
            ))}
          {step.kind === 'payout' &&
            recordMode === 'simulated' &&
            RECORD_SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`demo__chip${recordScenario === s.id ? ' is-active' : ''}`}
                aria-pressed={recordScenario === s.id}
                onClick={() => {
                  setRecordScenario(s.id)
                  setRecordRun((n) => n + 1)
                }}
              >
                {s.label}
              </button>
            ))}
        </div>
        {step.kind !== 'onboarding' && (
          <button
            type="button"
            className="demo__reset"
            onClick={() => {
              setStep({ kind: 'onboarding' })
              setChefWallet(null)
            }}
          >
            ↺ Restart flow
          </button>
        )}
      </aside>

      <footer className="shell__foot">
        <a href="https://github.com/santinocc/sapore-pay">Open source</a>
        <span aria-hidden="true">·</span>
        <span>Tempo · Privy · World ID · ENSv2</span>
      </footer>
    </div>
  )
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode
  onChange: (mode: Mode) => void
}) {
  return (
    <fieldset className="demo__row demo__fieldset">
      <legend className="sr-only">Data source</legend>
      {(['simulated', 'real'] as const).map((m) => (
        <button
          key={m}
          type="button"
          className={`demo__chip${mode === m ? ' is-active' : ''}`}
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
        >
          {m === 'simulated' ? 'Simulated' : 'Real (Sepolia)'}
        </button>
      ))}
    </fieldset>
  )
}

function StepDot({
  active,
  done,
  label,
}: {
  active: boolean
  done: boolean
  label: string
}) {
  return (
    <div
      className={`step-dot${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
    >
      <span className="step-dot__mark" aria-hidden="true">
        {done ? '✓' : ''}
      </span>
      <span className="step-dot__label">{label}</span>
    </div>
  )
}
