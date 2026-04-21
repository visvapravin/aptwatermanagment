import { useEffect, useState } from 'react'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { getDatabase, onValue, ref, update } from 'firebase/database'
import './App.css'

const firebaseConfig = {
  apiKey: 'AIzaSyD1C4cRZMhh49ZYMZRdFvAlvpHFAIiaFbs',
  authDomain: 'waterflowmoniter.firebaseapp.com',
  databaseURL:
    'https://waterflowmoniter-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'waterflowmoniter',
  storageBucket: 'waterflowmoniter.firebasestorage.app',
  messagingSenderId: '285922028698',
  appId: '1:285922028698:web:1e5612bda72bfc47e9c323',
  measurementId: 'G-TS9Q6RYNCC',
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
const db = getDatabase(app)
const MAX_TREND_POINTS = 40

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toBool = (value) => value === true || value === 'true' || value === 1

const prettyDate = (iso) => {
  if (!iso) return 'No timestamp in database'
  const date = new Date(iso)
  return Number.isNaN(date.valueOf())
    ? 'Invalid timestamp in database'
    : date.toLocaleString()
}

const formatTrendLabel = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function TrendChart({ points, dataKey, color, unit }) {
  if (!points.length) {
    return <p className="muted">Waiting for realtime samples...</p>
  }

  const width = 640
  const height = 230
  const padding = 22
  const values = points.map((point) => toNumber(point[dataKey], 0))
  let minValue = Math.min(...values)
  let maxValue = Math.max(...values)

  if (minValue === maxValue) {
    minValue -= 1
    maxValue += 1
  }

  const range = maxValue - minValue
  const plotWidth = width - padding * 2
  const plotHeight = height - padding * 2

  const chartPoints = points.map((point, index) => {
    const x =
      points.length === 1
        ? width / 2
        : padding + (index / (points.length - 1)) * plotWidth
    const y =
      padding + ((maxValue - toNumber(point[dataKey], 0)) / range) * plotHeight
    return { x, y }
  })

  const linePath = chartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  const areaPath = `${linePath} L ${chartPoints[chartPoints.length - 1].x} ${
    height - padding
  } L ${chartPoints[0].x} ${height - padding} Z`
  const lastValue = values[values.length - 1]

  return (
    <div className="chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <line
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
          className="axis"
        />
        <path d={areaPath} fill={color} opacity="0.15" />
        <path d={linePath} stroke={color} strokeWidth="3" fill="none" />
      </svg>
      <div className="chart-meta">
        <span>
          Start: {formatTrendLabel(points[0].timestamp)} | End:{' '}
          {formatTrendLabel(points[points.length - 1].timestamp)}
        </span>
        <span>
          Latest: {lastValue.toFixed(2)} {unit}
        </span>
      </div>
    </div>
  )
}

function App() {
  const [monitorData, setMonitorData] = useState(null)
  const [trendHistory, setTrendHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [limitInput, setLimitInput] = useState('25')
  const [fineRateInput, setFineRateInput] = useState('10')
  const [acceptedFine, setAcceptedFine] = useState(false)
  const [isSavingLimit, setIsSavingLimit] = useState(false)
  const [isSendingCommand, setIsSendingCommand] = useState(false)

  useEffect(() => {
    const monitorRef = ref(db, 'waterMonitor')

    const unsubscribe = onValue(
      monitorRef,
      (snapshot) => {
        const value = snapshot.val() || {}
        const current = value?.current || {}
        const usageValue = toNumber(
          current.totalUsageLiters ?? current.totalLitres,
          0,
        )
        const flowValue = toNumber(current.flowRateLpm ?? current.flowRate, 0)
        setTrendHistory((previous) => {
          const lastPoint = previous[previous.length - 1]
          const nextPoint = {
            timestamp: Date.now(),
            usage: usageValue,
            flow: flowValue,
          }

          if (
            lastPoint &&
            Math.abs(lastPoint.usage - nextPoint.usage) < 0.0001 &&
            Math.abs(lastPoint.flow - nextPoint.flow) < 0.0001
          ) {
            return previous
          }

          return [...previous, nextPoint].slice(-MAX_TREND_POINTS)
        })
        setMonitorData(value)
        const suggestedLimit = toNumber(
          value?.current?.communityLimitLiters ?? value?.current?.limit,
          25,
        )
        setLimitInput(String(suggestedLimit))
        setLoading(false)
        setError('')
      },
      (readError) => {
        setError(readError.message)
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  const current = monitorData?.current || {}
  const commands = monitorData?.commands || {}

  const flowRateLpm = toNumber(current.flowRateLpm ?? current.flowRate, 0)
  const totalUsageLiters = toNumber(
    current.totalUsageLiters ?? current.totalLitres,
    0,
  )
  const communityLimitLiters = toNumber(
    current.communityLimitLiters ?? current.limit,
    25,
  )
  const pumpOn = toBool(current.pumpOn)
  const desiredPumpOn = toBool(commands.desiredPumpOn)
  const cutoffTriggered =
    toBool(current.cutoffTriggered) ||
    toBool(current.cutoff) ||
    toBool(commands.cutoffTriggered)
  const updatedAt = current.updatedAt ?? commands.updatedAt

  const usagePercent =
    communityLimitLiters > 0 ? (totalUsageLiters / communityLimitLiters) * 100 : 0
  const observedPeakFlow = Math.max(
    ...trendHistory.map((point) => toNumber(point.flow, 0)),
    0,
  )
  const referenceMaxFlow = Math.max(observedPeakFlow, 10)
  const estimatedTankPercent = Math.max(
    0,
    Math.min(100, (flowRateLpm / referenceMaxFlow) * 100),
  )

  let tankLevel = 'Low'
  if (estimatedTankPercent >= 67) tankLevel = 'Full'
  else if (estimatedTankPercent >= 34) tankLevel = 'Medium'

  const exceededBy = Math.max(totalUsageLiters - communityLimitLiters, 0)
  const fineRate = Math.max(toNumber(fineRateInput, 0), 0)
  const fineAmount = exceededBy * fineRate

  const metrics = {
    flowRateLpm,
    totalUsageLiters,
    communityLimitLiters,
    usagePercent,
    estimatedTankPercent,
    tankLevel,
    pumpOn,
    desiredPumpOn,
    cutoffTriggered,
    updatedAt,
    exceededBy,
    fineRate,
    fineAmount,
  }

  const onSaveLimit = async () => {
    const parsedLimit = toNumber(limitInput, NaN)
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      setError('Community limit must be a positive number.')
      return
    }

    setIsSavingLimit(true)
    setError('')
    try {
      await update(ref(db, 'waterMonitor/current'), {
        communityLimitLiters: parsedLimit,
        limit: parsedLimit,
        updatedAt: new Date().toISOString(),
      })
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSavingLimit(false)
    }
  }

  const onSendPumpCommand = async (shouldRun) => {
    setIsSendingCommand(true)
    setError('')
    try {
      await update(ref(db, 'waterMonitor/commands'), {
        desiredPumpOn: shouldRun,
        updatedAt: new Date().toISOString(),
      })
    } catch (commandError) {
      setError(commandError.message)
    } finally {
      setIsSendingCommand(false)
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Apartment Water Control</p>
        <h1>Smart Water Usage Dashboard</h1>
        <p className="subhead">
          Live values from Firebase RTDB with approximate tank level and
          over-limit penalty.
        </p>
      </section>

      {loading ? (
        <p className="status">Loading realtime data...</p>
      ) : (
        <>
          {error && <p className="status error">{error}</p>}

          <section className="card-grid top-grid">
            <article className="card">
              <h2>Current Flow Rate</h2>
              <p className="big-number">{metrics.flowRateLpm.toFixed(2)} L/min</p>
            </article>
            <article className="card">
              <h2>Total Water Used</h2>
              <p className="big-number">{metrics.totalUsageLiters.toFixed(2)} L</p>
            </article>
            <article className="card">
              <h2>Community Limit</h2>
              <p className="big-number">
                {metrics.communityLimitLiters.toFixed(2)} L
              </p>
            </article>
            <article className="card">
              <h2>Pump Status</h2>
              <p className={`big-number ${metrics.pumpOn ? 'on' : 'off'}`}>
                {metrics.pumpOn ? 'ON' : 'OFF'}
              </p>
              <p className="muted">
                Requested: {metrics.desiredPumpOn ? 'ON' : 'OFF'}
              </p>
            </article>
          </section>

          <section className="card-grid mid-grid">
            <article className="card">
              <h2>Limit Usage</h2>
              <div className="meter-track">
                <div
                  className="meter-fill"
                  style={{ width: `${Math.min(100, metrics.usagePercent)}%` }}
                />
              </div>
              <p className="muted">{metrics.usagePercent.toFixed(1)}% consumed</p>
              <p className="muted">
                {metrics.cutoffTriggered
                  ? 'Cutoff currently triggered.'
                  : 'Auto-cutoff will trigger when threshold is reached.'}
              </p>
            </article>

            <article className="card">
              <h2>Approx Tank Level</h2>
              <p className="big-number">{metrics.tankLevel}</p>
              <p className="muted">
                Flow-based level index: {metrics.estimatedTankPercent.toFixed(1)}%
              </p>
              <p className="muted">
                Fast flow means higher water level; slow flow means lower level.
              </p>
            </article>

            <article className="card">
              <h2>Overuse Fine</h2>
              <p className="muted">
                Exceeded by: <strong>{metrics.exceededBy.toFixed(2)} L</strong>
              </p>
              <label className="field" htmlFor="fineRate">
                Fine rate per liter
              </label>
              <input
                id="fineRate"
                className="input"
                value={fineRateInput}
                onChange={(event) => setFineRateInput(event.target.value)}
                inputMode="decimal"
              />
              <label className="checkbox-row" htmlFor="acceptFine">
                <input
                  id="acceptFine"
                  type="checkbox"
                  checked={acceptedFine}
                  onChange={(event) => setAcceptedFine(event.target.checked)}
                />
                I accept the over-limit fine.
              </label>
              <p className="fine-total">
                Fine payable:{' '}
                {acceptedFine ? metrics.fineAmount.toFixed(2) : 'Accept terms'}
              </p>
            </article>
          </section>

          <section className="card-grid trend-grid">
            <article className="card">
              <div className="chart-head">
                <h2>Usage Trend</h2>
                <p className="muted">Last {trendHistory.length} updates</p>
              </div>
              <TrendChart
                points={trendHistory}
                dataKey="usage"
                color="#d8731a"
                unit="L"
              />
            </article>

            <article className="card">
              <div className="chart-head">
                <h2>Current Flow Rate Trend</h2>
                <p className="muted">Last {trendHistory.length} updates</p>
              </div>
              <TrendChart
                points={trendHistory}
                dataKey="flow"
                color="#156f9d"
                unit="L/min"
              />
            </article>
          </section>

          <section className="card-grid bottom-grid">
            <article className="card actions">
              <h2>Manual Pump Control</h2>
              <div className="action-row">
                <button
                  className="btn btn-on"
                  onClick={() => onSendPumpCommand(true)}
                  disabled={isSendingCommand}
                >
                  Turn ON
                </button>
                <button
                  className="btn btn-off"
                  onClick={() => onSendPumpCommand(false)}
                  disabled={isSendingCommand}
                >
                  Turn OFF
                </button>
              </div>
            </article>

            <article className="card actions">
              <h2>Set Community Limit</h2>
              <div className="action-row">
                <input
                  className="input"
                  value={limitInput}
                  onChange={(event) => setLimitInput(event.target.value)}
                  inputMode="decimal"
                />
                <button
                  className="btn btn-save"
                  onClick={onSaveLimit}
                  disabled={isSavingLimit}
                >
                  Save Limit
                </button>
              </div>
            </article>
          </section>

          <p className="status">Last update: {prettyDate(metrics.updatedAt)}</p>
        </>
      )}
    </main>
  )
}

export default App
