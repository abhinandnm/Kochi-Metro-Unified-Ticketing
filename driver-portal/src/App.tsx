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
  RefreshCw,
  XCircle,
  Car,
  Zap,
  Gauge,
  Compass
} from 'lucide-react'

type TripState = 'available' | 'accepted' | 'riding' | 'complete'
type PortalView = 'trips' | 'history' | 'wallet'
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

const STATION_COORDS: Record<string, [number, number]> = {
  'Aluva': [10.1098, 76.3571],
  'Edappally': [10.0252, 76.3082],
  'Kaloor': [9.9984, 76.2917],
  'MG Road': [9.9723, 76.2818],
  'Maharaja’s College': [9.9678, 76.2861],
  'Maharajas College': [9.9678, 76.2861],
  'Vyttila': [9.9658, 76.3195],
  'Pettta': [9.9515, 76.3312]
}

const DESTINATION_COORDS: Record<string, [number, number]> = {
  'Lulu Mall, Edappally': [10.0284, 76.3075],
  'Vyttila Mobility Hub': [9.9658, 76.3195],
  'MG Road, Kochi': [9.9723, 76.2818],
  'Marine Drive, Kochi': [9.9797, 76.2764],
  'Fort Kochi': [9.9658, 76.2421],
  'Infopark, Kakkanad': [10.0108, 76.3638],
  'SmartCity, Kakkanad': [10.0076, 76.3712],
  'Tripunithura': [9.9442, 76.3475]
}

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'

function CarGraphic({ isBus }: { isBus: boolean }) {
  if (isBus) {
    return (
      <svg viewBox="0 0 320 120" style={{ width: '100%', height: 'auto', maxHeight: '110px' }}>
        <defs>
          <linearGradient id="busGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
          <linearGradient id="glassGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="100%" stopColor="#7dd3fc" />
          </linearGradient>
        </defs>
        {/* Bus Body */}
        <rect x="20" y="25" width="280" height="65" rx="12" fill="url(#busGrad)" />
        <rect x="25" y="85" width="270" height="5" fill="#0c4a6e" />
        {/* Front windshield */}
        <path d="M 270 30 L 292 45 L 292 68 L 270 68 Z" fill="url(#glassGrad)" />
        {/* Windows */}
        <rect x="35" y="32" width="38" height="34" rx="4" fill="url(#glassGrad)" />
        <rect x="80" y="32" width="38" height="34" rx="4" fill="url(#glassGrad)" />
        <rect x="125" y="32" width="38" height="34" rx="4" fill="url(#glassGrad)" />
        <rect x="170" y="32" width="38" height="34" rx="4" fill="url(#glassGrad)" />
        <rect x="215" y="32" width="48" height="34" rx="4" fill="url(#glassGrad)" />
        {/* Wheels */}
        <circle cx="75" cy="92" r="16" fill="#1e293b" stroke="#64748b" strokeWidth="4" />
        <circle cx="75" cy="92" r="6" fill="#94a3b8" />
        <circle cx="245" cy="92" r="16" fill="#1e293b" stroke="#64748b" strokeWidth="4" />
        <circle cx="245" cy="92" r="6" fill="#94a3b8" />
        {/* Headlight */}
        <rect x="290" y="70" width="8" height="8" rx="2" fill="#fef08a" />
        {/* KMRL Feeder Decal */}
        <text x="35" y="78" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="sans-serif">KMRL FEEDER SHUTTLE</text>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 320 120" style={{ width: '100%', height: 'auto', maxHeight: '110px' }}>
      <defs>
        <linearGradient id="carGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#115e59" />
        </linearGradient>
        <linearGradient id="carGlass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ccfbf1" />
          <stop offset="100%" stopColor="#5eead4" />
        </linearGradient>
      </defs>
      {/* Ground Shadow */}
      <ellipse cx="160" cy="100" rx="130" ry="8" fill="rgba(0,0,0,0.15)" />
      {/* Car Roof & Cabin */}
      <path d="M 75 55 Q 110 25 155 24 Q 210 25 240 55 Z" fill="url(#carGlass)" />
      {/* Pillar */}
      <rect x="155" y="26" width="8" height="29" fill="#0f766e" />
      {/* Car Main Body */}
      <path d="M 25 60 Q 30 50 55 52 L 80 54 L 240 54 Q 275 54 295 68 L 295 82 Q 295 86 285 86 L 35 86 Q 25 86 25 75 Z" fill="url(#carGrad)" />
      {/* EV Line */}
      <path d="M 35 70 L 285 70" stroke="#2dd4bf" strokeWidth="2" strokeDasharray="6 3" />
      {/* Wheels */}
      <circle cx="80" cy="86" r="16" fill="#0f172a" stroke="#475569" strokeWidth="4" />
      <circle cx="80" cy="86" r="6" fill="#94a3b8" />
      <circle cx="240" cy="86" r="16" fill="#0f172a" stroke="#475569" strokeWidth="4" />
      <circle cx="240" cy="86" r="6" fill="#94a3b8" />
      {/* Headlights */}
      <path d="M 288 64 Q 296 66 295 72 L 284 72 Z" fill="#fef08a" />
      {/* Taillight */}
      <path d="M 25 64 Q 22 68 25 72 L 30 72 Z" fill="#ef4444" />
      {/* KMRL EV Badge */}
      <rect x="110" y="62" width="70" height="14" rx="3" fill="#ffffff" />
      <text x="115" y="73" fill="#0f766e" fontSize="9" fontWeight="bold" fontFamily="sans-serif">KMRL EV CAB</text>
    </svg>
  )
}

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

  const mapData = useMemo(() => {
    const origStation = activeCluster?.origin?.replace(/ Metro( Station)?/i, '').trim() || 'Vyttila'
    const destName = activeCluster?.destination || 'Infopark, Kakkanad'
    const origCoord = STATION_COORDS[origStation] || [9.9658, 76.3195]
    const destCoord = DESTINATION_COORDS[destName] || [10.0108, 76.3638]
    
    const minLat = Math.min(origCoord[0], destCoord[0]) - 0.015
    const maxLat = Math.max(origCoord[0], destCoord[0]) + 0.015
    const minLon = Math.min(origCoord[1], destCoord[1]) - 0.02
    const maxLon = Math.max(origCoord[1], destCoord[1]) + 0.02

    return {
      origStation,
      destName,
      origCoord,
      destCoord,
      embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${minLon.toFixed(4)},${minLat.toFixed(4)},${maxLon.toFixed(4)},${maxLat.toFixed(4)}&layer=mapnik&marker=${destCoord[0].toFixed(4)},${destCoord[1].toFixed(4)}`
    }
  }, [activeCluster])

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
            <small style={{ color: '#64748b' }}>KL 07 CD 4531 · {capacity >= 15 ? 'KMRL Feeder Bus' : capacity === 6 ? 'SUV Feeder' : 'Sedan (EV)'}</small>
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

      {/* Left Column: Driver Vehicle, Earnings, and Active Cluster Workflow */}
      <section className="content">
        {/* Active Vehicle Card with Car Graphic */}
        <div className="driver-vehicle-card">
          <div className="vehicle-card-top">
            <div>
              <span className="vehicle-badge"><Zap size={13} /> {capacity >= 15 ? 'KMRL Feeder Shuttle' : 'KMRL Certified EV'}</span>
              <h3 style={{ margin: '4px 0 2px 0', fontSize: '15px', color: '#0f766e' }}>
                {capacity >= 15 ? 'Feeder Bus (20 Seats)' : capacity === 6 ? 'SUV Feeder (6 Seats)' : 'Sedan EV (4 Seats)'}
              </h3>
              <small style={{ color: '#64748b', fontSize: '11px' }}>Plate: KL 07 CD 4531 · 94% Battery (210 km)</small>
            </div>
            <div className="capacity-select-box">
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '2px' }}>Capacity</label>
              <select
                value={capacity}
                onChange={(e) => {
                  const cap = Number(e.target.value)
                  setCapacity(cap)
                  void updateDriverAvailability(driverStatus, cap)
                }}
                className="vehicle-cap-dropdown"
              >
                <option value={4}>Cab / Sedan (4 seats)</option>
                <option value={6}>SUV Feeder (6 seats)</option>
                <option value={20}>KMRL Feeder Bus (20 seats)</option>
              </select>
            </div>
          </div>
          
          <div className="vehicle-graphic-container">
            <CarGraphic isBus={capacity >= 15} />
          </div>
        </div>

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
        {activeView === 'trips' ? tripsView : activeView === 'history' ? historyView : walletView}
      </section>

      {/* Right Column: Exact Real Dynamic Map */}
      <section className="map exact-map-panel">
        {/* Dynamic Vector Transit Map Layer */}
        <svg viewBox="0 0 500 450" className="vector-transit-map">
          <defs>
            <linearGradient id="mapBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
            <linearGradient id="waterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#bae6fd" />
              <stop offset="100%" stopColor="#7dd3fc" />
            </linearGradient>
            <linearGradient id="metroLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#0369a1" />
            </linearGradient>
            <linearGradient id="feederRouteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Map Base */}
          <rect width="500" height="450" fill="url(#mapBg)" />

          {/* Kochi Water Bodies / Vembanad Lake & Backwaters */}
          <path d="M 0 0 L 80 0 Q 120 120 70 220 Q 40 300 90 450 L 0 450 Z" fill="url(#waterGrad)" opacity="0.85" />
          <path d="M 60 160 Q 110 170 140 150 Q 110 190 60 180 Z" fill="url(#waterGrad)" opacity="0.8" />
          <text x="18" y="240" fill="#0369a1" fontSize="10" fontWeight="bold" opacity="0.7" transform="rotate(-75 18 240)">Vembanad Lake / Arabian Sea</text>

          {/* Road Network Grid */}
          <g stroke="#cbd5e1" strokeWidth="1.5" opacity="0.6">
            <line x1="60" y1="90" x2="480" y2="90" />
            <line x1="60" y1="170" x2="480" y2="170" />
            <line x1="60" y1="260" x2="480" y2="260" />
            <line x1="60" y1="350" x2="480" y2="350" />
            <line x1="160" y1="0" x2="160" y2="450" />
            <line x1="280" y1="0" x2="280" y2="450" />
            <line x1="390" y1="0" x2="390" y2="450" />
          </g>

          {/* Seaport-Airport Road (Corridor to Infopark) */}
          <path d="M 280 260 Q 340 240 420 190 Q 460 170 470 140" fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="4 2" />
          <text x="320" y="225" fill="#64748b" fontSize="8" fontWeight="600" transform="rotate(-22 320 225)">Seaport-Airport Expressway</text>

          {/* KMRL Blue Metro Viaduct Line */}
          <path
            d="M 260 30 L 230 100 L 200 170 L 180 230 L 210 300 L 240 370 L 270 430"
            fill="none"
            stroke="url(#metroLineGrad)"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Metro Stations Nodes */}
          <g fill="#ffffff" stroke="#0284c7" strokeWidth="3">
            <circle cx="260" cy="30" r="5" /><text x="272" y="34" fill="#0f172a" fontSize="9" fontWeight="bold" stroke="none">Aluva</text>
            <circle cx="230" cy="100" r="5" /><text x="242" y="104" fill="#0f172a" fontSize="9" fontWeight="bold" stroke="none">Edappally</text>
            <circle cx="200" cy="170" r="5" /><text x="212" y="174" fill="#0f172a" fontSize="9" fontWeight="bold" stroke="none">Kaloor</text>
            <circle cx="180" cy="230" r="5" /><text x="110" y="234" fill="#0f172a" fontSize="9" fontWeight="bold" stroke="none">MG Road</text>
            <circle cx="210" cy="300" r="6" stroke="#059669" strokeWidth="4" /><text x="225" y="304" fill="#0f172a" fontSize="10" fontWeight="bold" stroke="none">Vyttila Hub</text>
            <circle cx="240" cy="370" r="5" /><text x="252" y="374" fill="#0f172a" fontSize="9" fontWeight="bold" stroke="none">Pettta</text>
          </g>

          {/* Key Destination Points */}
          {/* Infopark Kakkanad */}
          <g>
            <rect x="400" y="150" width="70" height="24" rx="6" fill="#1e293b" opacity="0.9" />
            <text x="408" y="166" fill="#ffffff" fontSize="9" fontWeight="bold">🏢 Infopark</text>
            <circle cx="435" cy="182" r="5" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
          </g>
          {/* Lulu Mall */}
          <g>
            <rect x="140" y="76" width="75" height="22" rx="6" fill="#1e293b" opacity="0.9" />
            <text x="146" y="91" fill="#ffffff" fontSize="8" fontWeight="bold">🛍️ Lulu Mall</text>
            <circle cx="215" cy="87" r="4" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
          </g>
          {/* Marine Drive */}
          <g>
            <rect x="80" y="180" width="85" height="22" rx="6" fill="#1e293b" opacity="0.9" />
            <text x="86" y="195" fill="#ffffff" fontSize="8" fontWeight="bold">🌊 Marine Drive</text>
            <circle cx="165" cy="191" r="4" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
          </g>
          {/* Fort Kochi */}
          <g>
            <rect x="15" y="320" width="75" height="22" rx="6" fill="#1e293b" opacity="0.9" />
            <text x="21" y="335" fill="#ffffff" fontSize="8" fontWeight="bold">⚓ Fort Kochi</text>
            <circle cx="50" cy="315" r="4" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
          </g>

          {/* Active Feeder Route Trajectory (Vyttila -> Infopark/Corridor) */}
          <path
            d="M 210 300 Q 300 280 370 230 Q 410 200 435 182"
            fill="none"
            stroke="url(#feederRouteGrad)"
            strokeWidth="5"
            strokeDasharray="8 4"
            className="animated-feeder-path"
            filter="url(#glow)"
          />

          {/* Moving Feeder Vehicle GPS Tracker on Route */}
          <g className="live-gps-vehicle-marker" transform="translate(320, 260)">
            <circle cx="0" cy="0" r="14" fill="#10b981" opacity="0.25" />
            <circle cx="0" cy="0" r="9" fill="#059669" stroke="#ffffff" strokeWidth="2" />
            <path d="M -3 -4 L 5 0 L -3 4 Z" fill="#ffffff" transform="rotate(-35)" />
          </g>
        </svg>

        <div className="map-overlay-header">
          <div className="map-nav-pill">
            <Navigation size={15} color="#0284c7" />
            <div>
              <strong>{activeCluster ? `${activeCluster.origin} Metro Station` : 'Kochi Metro Corridor'}</strong>
              <small style={{ display: 'block', color: '#64748b' }}>
                {activeCluster ? `Destination: ${activeCluster.destination}` : 'Listening for passenger clusters'}
              </small>
            </div>
          </div>
          {activeCluster && (
            <div className="map-bay-badge">
              <span>Dynamic Bay</span>
              <strong>{activeCluster.pickup_zone}</strong>
            </div>
          )}
        </div>

        <div className="map-status">
          <span className="pulse" /> {driverStatus === 'AVAILABLE' ? (activeCluster ? `Cluster Route: ${activeCluster.destination} (${activeCluster.estimated_minutes} min)` : 'Connected to KMRL Dispatch Network') : `Driver status: ${driverStatus}`}
        </div>
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
      </nav>
    </main>
  )
}
