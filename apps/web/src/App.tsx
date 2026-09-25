/**
 * Sapore Pay — the public demo judges open.
 *
 * Built during ETHGlobal Tokyo 2026. The recipe marketplace it serves (Sapore)
 * is pre-existing and private; everything here is new.
 */

import { useMemo, useState } from 'react'
import {
  createSimulatedVerifier,
  type SimulatedScenario,
} from './lib/humanVerifier'
import { ChefOnboarding } from './screens/ChefOnboarding'
import './theme.css'
import './app.css'

/**
 * Until WORLD_APP_ID exists this drives the flow, and afterwards it stays as
 * the alternative-path demo. World's requirement 4 asks to *demonstrate* a
 * meaningful alternative path; a reviewer should be able to see the
 * already-registered screen without us having to break something live.
 */
const SCENARIOS: { id: SimulatedScenario; label: string }[] = [
  { id: 'verified', label: 'Success' },
  { id: 'already_registered', label: 'Already a Chef' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'unavailable', label: 'No credential' },
  { id: 'error', label: 'Service error' },
]

export function App() {
  const [scenario, setScenario] = useState<SimulatedScenario>('verified')
  // Remount the flow when the scenario changes so it returns to its intro.
  const [run, setRun] = useState(0)
  const verifier = useMemo(() => createSimulatedVerifier(scenario), [scenario])

  return (
    <div className="shell">
      <header className="shell__head">
        <span className="shell__mark">SAPORE</span>
        <span className="shell__sub">PAY</span>
      </header>

      <main className="shell__main">
        <ChefOnboarding
          key={`${scenario}-${run}`}
          verifier={verifier}
          accountId="demo-cooker-0x01"
        />
      </main>

      <aside className="demo" aria-label="Demo controls">
        <p className="demo__title">
          Demo controls
          <span className="demo__note">
            World ID is simulated until the app id is configured. Each option is
            a real outcome the live verifier can return.
          </span>
        </p>
        <div className="demo__row">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`demo__chip${scenario === s.id ? ' is-active' : ''}`}
              aria-pressed={scenario === s.id}
              onClick={() => {
                setScenario(s.id)
                setRun((n) => n + 1)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </aside>

      <footer className="shell__foot">
        <a href="https://github.com/santinocc/sapore-pay">Open source</a>
        <span aria-hidden="true">·</span>
        <span>Tempo · Privy · World ID · ENSv2</span>
      </footer>
    </div>
  )
}
