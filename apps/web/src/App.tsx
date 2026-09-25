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
 */

import { useMemo, useState } from 'react'
import {
  createSimulatedSubnameClaimer,
  type SimulatedClaimScenario,
} from './lib/ensClaim'
import {
  createSimulatedVerifier,
  type SimulatedScenario,
} from './lib/humanVerifier'
import {
  createSimulatedRecordWriter,
  type SimulatedRecordScenario,
} from './lib/recordWriter'
import { ChefOnboarding } from './screens/ChefOnboarding'
import { EnsClaim } from './screens/EnsClaim'
import { PayoutRecords } from './screens/PayoutRecords'
import './theme.css'
import './app.css'

type Step =
  | { kind: 'onboarding' }
  | { kind: 'ens-claim' }
  | { kind: 'payout'; fullName: string }

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

  const [worldScenario, setWorldScenario] =
    useState<SimulatedScenario>('verified')
  const [worldRun, setWorldRun] = useState(0)
  const worldVerifier = useMemo(
    () => createSimulatedVerifier(worldScenario),
    [worldScenario],
  )

  const [claimScenario, setClaimScenario] =
    useState<SimulatedClaimScenario>('claimed')
  const [claimRun, setClaimRun] = useState(0)
  const claimer = useMemo(
    () => createSimulatedSubnameClaimer(claimScenario),
    [claimScenario],
  )

  const [recordScenario, setRecordScenario] =
    useState<SimulatedRecordScenario>('written')
  const [recordRun, setRecordRun] = useState(0)
  const recordWriter = useMemo(
    () => createSimulatedRecordWriter(recordScenario),
    [recordScenario],
  )

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
        {step.kind === 'ens-claim' && (
          <EnsClaim
            key={`claim-${claimScenario}-${claimRun}`}
            claimer={claimer}
            ownerAddress="0x0d9f3D27e8F4EEBC80e445a59dAD5A9173d951ab"
            onClaimed={(fullName) => setStep({ kind: 'payout', fullName })}
          />
        )}
        {step.kind === 'payout' && (
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
              'sapore.eth is real (ENSv2 Sepolia); subname claiming is simulated pending the contract-developer guide.'}
            {step.kind === 'payout' &&
              'Record writing is real code (ensRecords.ts) — simulated here only because no resolver exists on a claimed subname yet.'}
          </span>
        </p>
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
            onClick={() => setStep({ kind: 'onboarding' })}
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
