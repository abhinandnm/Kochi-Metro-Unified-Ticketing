import { useEffect, useMemo, useState } from 'react'
import {
  Bike,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  Navigation,
  Power,
  Route,
  TrainFront,
  Users,
  Wallet,
  ShieldCheck,
  KeyRound,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  XCircle,
  Sliders,
  DollarSign
} from 'lucide-react'

type TripState = 'available' | 'accepted' | 'riding' | 'complete'
type PortalView = 'trips' | 'history' | 'wallet' | 'simulator'
type Passenger = { id: number; passenger_name: string; destination: string; status: string; otp?: string }
type Cluster = {
  id: number
  origin: string
  destination: string
  pickup_zone: string
  passenger_count: number
  estimated_minutes: number
  fare: number
  status: 'open' | 'accepted' | 'arriving' | 'arrived' | 'in_transit' | 'completed'
  driver_name?: string
  vehicle_type?: string
  vehicle_capacity?: number
  score?: number
  detour_minutes?: number
  wait_minutes?: number
  compatibility?: string
  passengers: Passenger[]
}
type TripRecord = { id: number; route: string; earnings: number; completedAt: string }

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'

export default function App() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [driverStatus, setDriverStatus] = useState<'AVAILABLE' | 'BUSY' | 'OFFLINE'>('AVAILABLE')
  const [capacity, setCapacity] = useState(4)
  const [trip, setTrip] = useState<TripState>('available')
  const [activeView, setActiveView] = useState<PortalView>('trips')
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [earnings, setEarnings] = useState(1250)
  const [tripHistory, setTripHistory] = useState<TripRecord[]>([])
  const [apiError, setApiError] = useState('')
  const [showDisclaimer, setShowDisclaimer] = useState(true)

  // OTP Verification state
  const [otpInput, setOtpInput] = useState('')
  const [otpError, setOtpError] = useState('')

  // Simulator state
  const [simDailyPassengers, setSimDailyPassengers] = useState(1000)
  const [simAvgFare, setSimAvgFare] = useState(80)
  const [simKmrlComm, setSimKmrlComm] = useState(10)

  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('kmrl_driver_token') || '')
  const [driverTripStage, setDriverTripStage] = useState<'open' | 'accepted' | 'arriving' | 'arrived' | 'in_transit' | 'completed'>('open')

  const initials = username.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'VK'
  
  const activeCluster = useMemo(() => {
    return (
      clusters.find((c) => (c.status === 'accepted' || c.status === 'arriving' || c.status === 'arrived' || c.status === 'in_transit') && c.driver_name?.toLowerCase() === username.trim().toLowerCase()) ||
      clusters.find((c) => c.status === 'open')
    )
  }, [clusters, username])

  const loadClusters = async () => {
    try {
      const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {}
      const response = await fetch(`${apiBase}/clusters`, { headers })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load bookings.')
      setClusters(result.clusters || [])
      setApiError('')
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to load bookings.')
    }
  }

  useEffect(() => {
    if (!signedIn) return
    void loadClusters()
    const timer = window.setInterval(() => void loadClusters(), 3000)
    return () => window.clearInterval(timer)
  }, [signedIn, authToken])

  const updateDriverAvailability = async (newStatus: 'AVAILABLE' | 'BUSY' | 'OFFLINE', newCapacity = capacity) => {
    setDriverStatus(newStatus)
    if (username.trim()) {
      try {
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
        await fetch(`${apiBase}/drivers/status`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            driver_name: username.trim(),
            status: newStatus,
            capacity: newCapacity,
            online: newStatus !== 'OFFLINE'
          })
        })
      } catch {}
    }
  }

  const handleSignIn = async () => {
    if (!username.trim() || !password) {
      setLoginError('Please enter username and demo password "123".')
      return
    }
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, role: 'driver' })
      })
      const data = await res.json()
      if (!res.ok) {
        setLoginError(data.error || 'Invalid credentials. Use demo password "123".')
        return
      }
      setAuthToken(data.token)
      localStorage.setItem('kmrl_driver_token', data.token)
      setSignedIn(true)
      setLoginError('')
      await updateDriverAvailability('AVAILABLE', capacity)
    } catch {
      if (password === '123') {
        setSignedIn(true)
        setLoginError('')
      } else {
        setLoginError('Invalid credentials. Use demo password "123".')
      }
    }
  }

  const openNavigation = () => {
    const station = activeCluster ? `${activeCluster.origin} Metro Station` : 'Vyttila Metro Station'
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(station)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const acceptCluster = async () => {
    if (!activeCluster) return
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      }
      const response = await fetch(`${apiBase}/clusters/${activeCluster.id}/accept`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ driver_name: username.trim() })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Cluster is unavailable.')
      setTrip('accepted')
      setDriverStatus('BUSY')
      await loadClusters()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to accept cluster.')
    }
  }

  const markArriving = async () => {
    if (!activeCluster) return
    try {
      const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {}
      const res = await fetch(`${apiBase}/clusters/${activeCluster.id}/arriving`, { method: 'POST', headers })
      if (res.ok) await loadClusters()
    } catch {}
  }

  const markArrived = async () => {
    if (!activeCluster) return
    try {
      const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {}
      const res = await fetch(`${apiBase}/clusters/${activeCluster.id}/arrived`, { method: 'POST', headers })
      if (res.ok) await loadClusters()
    } catch {}
  }

  const verifyOtpAndStartTrip = async () => {
    if (!activeCluster) return
    if (!otpInput.trim()) {
      setOtpError('Please enter passenger 4-digit OTP.')
      return
    }
    setOtpError('')
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      }
      const response = await fetch(`${apiBase}/clusters/${activeCluster.id}/start-trip`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ otp: otpInput.trim() })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'OTP verification failed.')
      setTrip('riding')
      setOtpInput('')
      await loadClusters()
    } catch (error) {
      setOtpError(error instanceof Error ? error.message : 'Invalid OTP code.')
    }
  }

  const completeTrip = async () => {
    if (!activeCluster) return
    try {
      const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {}
      const response = await fetch(`${apiBase}/clusters/${activeCluster.id}/complete`, { method: 'POST', headers })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to complete trip.')
      const earned = result.earnings || Math.round(activeCluster.fare * 0.75)
      setEarnings((prev) => prev + earned)
      setTripHistory((prev) => [
        {
          id: activeCluster.id,
          route: `${activeCluster.origin} → ${activeCluster.destination}`,
          earnings: earned,
          completedAt: new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date())
        },
        ...prev
      ])
      setTrip('complete')
      setDriverStatus('AVAILABLE')
      await loadClusters()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to complete trip.')
    }
  }

  const cancelCluster = async () => {
    if (!activeCluster) return
    if (confirm('Cancel this cluster? It will immediately enter replacement matching for riders.')) {
      try {
        const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {}
        await fetch(`${apiBase}/clusters/${activeCluster.id}/cancel-driver`, { method: 'POST', headers })
        setTrip('available')
        setDriverStatus('AVAILABLE')
        await loadClusters()
      } catch (error) {
        setApiError('Unable to cancel cluster.')
      }
    }
  }

  if (!signedIn) {
    return (
      <>
        {showDisclaimer && (
          <div className="disclaimer-banner" style={{ background: '#fffae6', color: '#856404', padding: '16px', fontSize: '12px', borderBottom: '1px solid #ffeeba', position: 'relative', zIndex: 1000 }}>
            <button onClick={() => setShowDisclaimer(false)} style={{ position: 'absolute', right: '8px', top: '8px', background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#856404' }}>×</button>
            <strong>Prototype Disclaimer:</strong> The passenger and driver portals are proof-of-concept demonstrations and are not production systems. The station information, routes, fares, distances, passenger counts, and other operational data shown in the prototype are representative/demo data and are not intended to reflect actual KMRL fares, routes, schedules, or operational information.<br/><br/>
            The authentication in the prototype is also simplified for demonstration purposes; any username can be used with the demo password <strong>123</strong>. No real passenger, driver, payment, or KMRL data is used.<br/><br/>
            The prototype is intended solely to demonstrate the proposed workflow and user experience.
          </div>
        )}
        <main className="driver-shell driver-login">
          <div className="login-logo"><TrainFront size={27} /></div>
          <small>KOCHI METRO DRIVER PARTNER PORTAL</small>
          <h1>Drive with Kochi Metro.</h1>
          <p>Sign in to view and accept passenger ride clusters.</p>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Driver Name / Username" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (use 123)" />
          <button className="primary" onClick={() => void handleSignIn()}>Continue <ChevronRight size={20} /></button>
          {loginError && <small className="driver-error">{loginError}</small>}
        </main>
      </>
    )
  }

  // Simulation calculations
  const simGrossRevenue = simDailyPassengers * simAvgFare
  const simKmrlRevenue = Math.round(simGrossRevenue * (simKmrlComm / 100))
  const simDriverPayout = Math.round(simGrossRevenue * 0.75)
  const simOpsCost = simGrossRevenue - simKmrlRevenue - simDriverPayout

  const tripsView = trip === 'complete' ? (
    <section className="completed">
      <CheckCircle2 size={42} color="#059669" />
      <h2>Cluster Finished!</h2>
      <p>Your earnings have been credited to your driver wallet.</p>
      <button className="primary" onClick={() => setTrip('available')}>Find Next Cluster <ChevronRight size={20} /></button>
    </section>
  ) : !activeCluster ? (
    <section className="empty-state">
      <Users size={32} />
      <strong>No pending clusters at current capacity</strong>
      <p>You are marked <strong>{driverStatus}</strong> ({capacity} seats). New incoming passenger groups will appear here.</p>
      <button className="nav-button" onClick={() => void loadClusters()}><RefreshCw size={18} /> Refresh Live Clusters</button>
    </section>
  ) : (
    <>
      <div className="section-title">
        <div>
          <small>SMART PASSENGER CLUSTER</small>
          <h2>
            {trip === 'available' ? 'Cluster Match Available' : trip === 'accepted' ? 'Pickup at Assigned Zone' : 'Trip in Progress'}
          </h2>
        </div>
        <span className="cluster" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 600, padding: '4px 8px', borderRadius: '8px' }}>
          {activeCluster.passenger_count}/{activeCluster.vehicle_capacity || 4} Seats
        </span>
      </div>

      <section className="cluster-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#ffffff', marginBottom: '16px' }}>
        <div className="cluster-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="trip-icon" style={{ background: '#f1f5f9', padding: '8px', borderRadius: '8px' }}><Bike size={20} /></span>
            <div>
              <strong style={{ fontSize: '15px' }}>{activeCluster.origin} → {activeCluster.destination}</strong>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                <Clock3 size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {activeCluster.estimated_minutes} min travel
              </p>
            </div>
          </div>
          <span className="price" style={{ fontSize: '18px', fontWeight: 'bold', color: '#059669' }}>₹{Math.round(activeCluster.fare * 0.75)}</span>
        </div>

        {/* Route compatibility & Detour evaluation metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: '#f8fafc', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '11px', textAlign: 'center' }}>
          <div>
            <span style={{ color: '#64748b' }}>Match Score</span>
            <div style={{ fontWeight: 'bold', color: '#0284c7' }}>{activeCluster.score || 87}%</div>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>Est. Detour</span>
            <div style={{ fontWeight: 'bold', color: '#059669' }}>+{activeCluster.detour_minutes || 6} min</div>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>Wait Time</span>
            <div style={{ fontWeight: 'bold', color: '#6366f1' }}>~{activeCluster.wait_minutes || 5} min</div>
          </div>
        </div>

        {/* Dynamic Zone */}
        <div className="route-steps" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e40af', fontWeight: 600, fontSize: '13px' }}>
            <MapPin size={16} /> Pickup Station: {activeCluster.origin} Metro
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e3a8a', fontWeight: 'bold', fontSize: '13px', marginTop: '4px' }}>
            📍 Assigned Dynamic Slot: {activeCluster.pickup_zone}
          </div>
        </div>

        {/* Passenger List */}
        <div className="passenger-list" style={{ marginTop: '10px' }}>
          <small style={{ fontWeight: 600, color: '#64748b', textTransform: 'uppercase', fontSize: '11px' }}>Grouped Passengers</small>
          {activeCluster.passengers.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
              <strong>{p.passenger_name}</strong>
              <span style={{ color: '#64748b' }}>{p.destination}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Lifecycle Transitions */}
      {activeCluster.status === 'accepted' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button className="primary" style={{ margin: 0, flex: 1 }} onClick={() => void markArriving()}>
            Signal: En Route to Bay <ChevronRight size={18} />
          </button>
        </div>
      )}

      {activeCluster.status === 'arriving' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button className="primary" style={{ margin: 0, flex: 1, background: '#059669' }} onClick={() => void markArrived()}>
            Signal: Arrived at Bay <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Safety OTP Verification step when accepted or arrived */}
      {(activeCluster.status === 'accepted' || activeCluster.status === 'arriving' || activeCluster.status === 'arrived') && (
        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '14px', borderRadius: '10px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
            <KeyRound size={16} /> Passenger Safety Verification
          </div>
          <p style={{ fontSize: '12px', color: '#78350f', margin: '0 0 10px 0' }}>
            Ask the boarding passenger for their 4-digit OTP shown on their Kochi Metro app:
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              maxLength={4}
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value)}
              placeholder="Enter OTP"
              style={{ padding: '10px', fontSize: '16px', letterSpacing: '4px', textAlign: 'center', width: '160px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
            <button className="primary" style={{ margin: 0 }} onClick={() => void verifyOtpAndStartTrip()}>
              Verify OTP & Start <ChevronRight size={18} />
            </button>
          </div>
          {otpError && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px' }}>{otpError}</div>}
        </div>
      )}

      {activeCluster.status === 'open' && (
        <button disabled={driverStatus === 'OFFLINE'} className="primary" onClick={() => void acceptCluster()}>
          Accept Cluster ({activeCluster.passenger_count} Riders) <ChevronRight size={20} />
        </button>
      )}

      {activeCluster.status === 'in_transit' && (
        <button className="primary" onClick={() => void completeTrip()}>
          Complete & Settle Cluster (+₹{Math.round(activeCluster.fare * 0.75)}) <ChevronRight size={20} />
        </button>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
        <button className="nav-button" style={{ flex: 1 }} onClick={openNavigation}>
          <Route size={16} /> Navigate to Zone
        </button>
        {trip !== 'available' && (
          <button className="nav-button" style={{ color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => void cancelCluster()}>
            <XCircle size={16} /> Cancel Cluster
          </button>
        )}
      </div>
    </>
  )

  const historyView = (
    <>
      <div className="section-title">
        <div>
          <small>RIDE HISTORY</small>
          <h2>Completed Trips</h2>
        </div>
      </div>
      {tripHistory.length === 0 ? (
        <section className="empty-state">
          <Clock3 size={32} />
          <strong>No completed rides this session</strong>
          <p>Accept and complete passenger clusters to log your verified payout.</p>
        </section>
      ) : (
        tripHistory.map((record) => (
          <section className="history-card" key={record.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px', background: '#fff', borderRadius: '10px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <CheckCircle2 size={20} color="#059669" />
              <div>
                <strong style={{ fontSize: '14px' }}>{record.route}</strong>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Completed at {record.completedAt}</p>
              </div>
            </div>
            <span className="price" style={{ fontWeight: 'bold', color: '#059669' }}>+₹{record.earnings}</span>
          </section>
        ))
      )}
    </>
  )

  const walletView = (
    <>
      <div className="section-title">
        <div>
          <small>DRIVER WALLET</small>
          <h2>Your Balance & Payouts</h2>
        </div>
      </div>
      <section className="wallet-card" style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', color: '#fff', padding: '20px', borderRadius: '14px', marginBottom: '16px' }}>
        <Wallet size={30} />
        <small style={{ display: 'block', opacity: 0.85, marginTop: '8px' }}>AVAILABLE PAYOUT BALANCE</small>
        <strong style={{ fontSize: '28px', display: 'block', margin: '4px 0' }}>₹{earnings}</strong>
        <p style={{ fontSize: '12px', opacity: 0.9, margin: 0 }}>
          {tripHistory.length} completed cluster{tripHistory.length === 1 ? '' : 's'} with 75% last-mile split.
        </p>
      </section>
      <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>
        <strong>Commercial Settlement Split:</strong><br />
        • Driver Share: <strong>75%</strong> of Last-Mile Fare<br />
        • KMRL Unified Component: <strong>15%</strong><br />
        • Ops & Safety Insurance: <strong>10%</strong>
      </div>
    </>
  )

  const simulatorView = (
    <>
      <div className="section-title">
        <div>
          <small>KMRL MANAGEMENT TOOL</small>
          <h2>Business Economics Simulator</h2>
        </div>
      </div>

      <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0369a1', fontWeight: 'bold', marginBottom: '12px' }}>
          <BarChart3 size={18} /> Today's Unified Operational Metrics
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div style={{ background: '#f0f9ff', padding: '10px', borderRadius: '8px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Vehicle Occupancy</span>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0369a1' }}>3.4 / 4 (85%)</div>
          </div>
          <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '8px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Feeder Bus Demand</span>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#15803d' }}>34 / 40 seats (85%)</div>
          </div>
        </div>

        <div style={{ fontSize: '12px', color: '#334155', lineHeight: '1.6', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Estimated Daily Revenue:</span>
            <strong>₹43,800</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669' }}>
            <span>Driver Payouts (75%):</span>
            <strong>₹34,000</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0284c7' }}>
            <span>KMRL Revenue Share (15%):</span>
            <strong>₹5,300</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
            <span>Platform Operations:</span>
            <strong>₹4,500</strong>
          </div>
        </div>
      </section>

      <section style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontWeight: 'bold', marginBottom: '12px' }}>
          <Sliders size={18} /> Scenario Modeler
        </div>

        <label style={{ display: 'block', fontSize: '12px', marginBottom: '10px' }}>
          Daily Unified Passengers: <strong>{simDailyPassengers}</strong>
          <input
            type="range"
            min={100}
            max={5000}
            step={100}
            value={simDailyPassengers}
            onChange={(e) => setSimDailyPassengers(Number(e.target.value))}
            style={{ width: '100%', marginTop: '4px' }}
          />
        </label>

        <label style={{ display: 'block', fontSize: '12px', marginBottom: '10px' }}>
          Average Last-Mile Fare: <strong>₹{simAvgFare}</strong>
          <input
            type="range"
            min={40}
            max={150}
            step={5}
            value={simAvgFare}
            onChange={(e) => setSimAvgFare(Number(e.target.value))}
            style={{ width: '100%', marginTop: '4px' }}
          />
        </label>

        <label style={{ display: 'block', fontSize: '12px', marginBottom: '14px' }}>
          Partner Commission: <strong>{simKmrlComm}%</strong>
          <input
            type="range"
            min={5}
            max={25}
            step={1}
            value={simKmrlComm}
            onChange={(e) => setSimKmrlComm(Number(e.target.value))}
            style={{ width: '100%', marginTop: '4px' }}
          />
        </label>

        <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Estimated Gross:</span>
            <strong>₹{simGrossRevenue.toLocaleString()}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0369a1', fontWeight: 'bold' }}>
            <span>Estimated KMRL Component:</span>
            <span>₹{simKmrlRevenue.toLocaleString()}</span>
          </div>
        </div>
      </section>
    </>
  )

  return (
    <main className="driver-shell">
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="avatar">{initials}</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h1 style={{ margin: 0, fontSize: '18px' }}>{username}</h1>
              <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                VERIFIED PARTNER ✓
              </span>
            </div>
            <small style={{ color: '#64748b' }}>KL 07 CD 4531 · Sedan (EV)</small>
          </div>
        </div>

        {/* Availability State Toggle */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`online ${driverStatus === 'AVAILABLE' ? '' : driverStatus === 'BUSY' ? 'busy' : 'off'}`}
            onClick={() => {
              const next = driverStatus === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE'
              void updateDriverAvailability(next)
            }}
          >
            <Power size={14} />
            {driverStatus}
          </button>
        </div>
      </header>

      {/* Seat Capacity Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', background: '#f1f5f9', fontSize: '12px' }}>
        <span>Active Vehicle Capacity:</span>
        <select
          value={capacity}
          onChange={(e) => {
            const cap = Number(e.target.value)
            setCapacity(cap)
            void updateDriverAvailability(driverStatus, cap)
          }}
          style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
        >
          <option value={4}>Cab / Sedan (4 seats)</option>
          <option value={6}>SUV Feeder (6 seats)</option>
          <option value={20}>KMRL Feeder Bus (20 seats)</option>
        </select>
      </div>

      <section className="map">
        <div className="map-label">
          <Navigation size={16} />
          <span>{activeCluster ? `${activeCluster.origin} Metro Station (${activeCluster.pickup_zone})` : 'Waiting for bookings'}</span>
        </div>
        <span className="pin one" />
        <span className="pin two" />
        <span className="route-line" />
        <div className="map-status">
          <span className="pulse" /> {driverStatus === 'AVAILABLE' ? 'Listening for passenger clusters' : `Driver state: ${driverStatus}`}
        </div>
      </section>

      <section className="content">
        <div className="earnings">
          <div>
            <small>TODAY’S EARNINGS</small>
            <strong>₹{earnings}</strong>
            <p>
              {tripHistory.length === 0 ? 'Accept a cluster to start earning' : `${tripHistory.length} completed cluster${tripHistory.length === 1 ? '' : 's'} today`}
            </p>
          </div>
          <Wallet size={25} />
        </div>

        {apiError && <p className="driver-error">{apiError}</p>}
        {activeView === 'trips' ? tripsView : activeView === 'history' ? historyView : activeView === 'wallet' ? walletView : simulatorView}
      </section>

      <nav>
        <button className={activeView === 'trips' ? 'active' : ''} onClick={() => setActiveView('trips')}>
          <MapPin size={19} />
          <span>Trips</span>
        </button>
        <button className={activeView === 'history' ? 'active' : ''} onClick={() => setActiveView('history')}>
          <Clock3 size={19} />
          <span>History</span>
        </button>
        <button className={activeView === 'wallet' ? 'active' : ''} onClick={() => setActiveView('wallet')}>
          <Wallet size={19} />
          <span>Wallet</span>
        </button>
        <button className={activeView === 'simulator' ? 'active' : ''} onClick={() => setActiveView('simulator')}>
          <BarChart3 size={19} />
          <span>Simulator</span>
        </button>
      </nav>
    </main>
  )
}
