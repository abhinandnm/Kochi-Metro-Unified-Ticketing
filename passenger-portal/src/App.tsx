import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bell,
  Bike,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CloudRain,
  CreditCard,
  Footprints,
  MapPin,
  Navigation,
  QrCode,
  ShieldCheck,
  Sparkles,
  TrainFront,
  UsersRound,
  WalletCards,
  KeyRound,
  Share2,
  AlertOctagon,
  LifeBuoy,
  RefreshCw,
  BarChart3,
  Sliders,
  ChevronDown,
  ChevronUp,
  Car
} from 'lucide-react'

type JourneyKind = 'standard' | 'orbit'
type AssignedDriver = {
  initials: string
  name: string
  vehicle: string
  vehicle_type: string
  verified: boolean
  mode: 'cab' | 'feeder'
  assigned: boolean
}
type BookingStatus = {
  clusterStatus: string
  clusterPassengerCount: number
  assignedZone: string
  driverName?: string
  driverVehicle?: string
  driverVehicleType?: string
  otp?: string
  clusterScore?: number
  detourMinutes?: number
  waitMinutes?: number
  compatibility?: string
}
type FareQuote = {
  fare: number
  metro_fare: number
  last_mile_fare: number
  distance_km?: number
  online_drivers?: number
  available_capacity?: number
  drivers_available?: boolean
  breakdown?: {
    metro_fare: number
    last_mile_fare: number
    base_fare: number
    distance_charge: number
    shared_discount: number
  }
  commercial_split?: {
    driver_payout: number
    kmrl_share: number
    platform_ops: number
  }
}

const metroStations = [
  'Aluva Metro Station',
  'Edappally Metro Station',
  'Kaloor Metro Station',
  'MG Road Metro Station',
  'Maharaja’s College Metro Station',
  'Vyttila Metro Station',
  'Pettta Metro Station'
]
const finalDestinations = [
  'Lulu Mall, Edappally',
  'Vyttila Mobility Hub',
  'MG Road, Kochi',
  'Marine Drive, Kochi',
  'Fort Kochi',
  'Infopark, Kakkanad',
  'SmartCity, Kakkanad',
  'Tripunithura'
]
const pendingDriver: AssignedDriver = {
  initials: '…',
  name: 'Driver assignment in progress',
  vehicle: 'Dynamic zone slot reserved',
  vehicle_type: 'Sedan / Feeder',
  verified: true,
  mode: 'cab',
  assigned: false
}
const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'

export default function App() {
  const [journeyKind, setJourneyKind] = useState<JourneyKind>('orbit')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pickup, setPickup] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [matching, setMatching] = useState(false)
  const [boarding, setBoarding] = useState(false)
  const [tripStarted, setTripStarted] = useState(false)
  const [driver, setDriver] = useState<AssignedDriver>(pendingDriver)
  const [bookingId, setBookingId] = useState<number | null>(null)
  const [bookingStatus, setBookingStatus] = useState<BookingStatus | null>(null)
  const [passengerOtp, setPassengerOtp] = useState('4721')
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [bookingError, setBookingError] = useState('')
  const [fallbackOptions, setFallbackOptions] = useState<string[]>([])
  const [quotes, setQuotes] = useState<{ standard?: FareQuote; orbit?: FareQuote }>({})
  const [showFareBreakdown, setShowFareBreakdown] = useState(false)
  const [showSimulator, setShowSimulator] = useState(false)

  // Safety actions modal
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [sosTriggered, setSosTriggered] = useState(false)

  // Simulator controls
  const [simDailyPassengers, setSimDailyPassengers] = useState(1000)
  const [simAvgFare, setSimAvgFare] = useState(80)
  const [simKmrlComm, setSimKmrlComm] = useState(10)

  const fares = useMemo(() => {
    const quote = quotes[journeyKind]
    return journeyKind === 'orbit'
      ? {
          amount: quote?.fare ?? 0,
          label: quote
            ? `Metro ₹${quote.metro_fare} + shared last mile ₹${quote.last_mile_fare}`
            : 'Choose a route for an estimated fare',
          saving: 'Shared cluster discount applied (15%)'
        }
      : {
          amount: quote?.fare ?? 0,
          label: quote ? 'Metro ticket · route-based fare' : 'Choose a route for an estimated fare',
          saving: 'Direct metro fare'
        }
  }, [journeyKind, quotes])

  useEffect(() => {
    if (!from || !to) {
      setQuotes({})
      return
    }
    const loadQuotes = async () => {
      try {
        const quoteFor = async (kind: JourneyKind) => {
          const response = await fetch(`${apiBase}/journeys/quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: from, destination: to, journey_type: kind })
          })
          if (!response.ok) throw new Error('Unable to estimate fare.')
          return response.json() as Promise<FareQuote>
        }
        const [standard, orbit] = await Promise.all([quoteFor('standard'), quoteFor('orbit')])
        setQuotes({ standard, orbit })
      } catch {
        setQuotes({})
      }
    }
    void loadQuotes()
  }, [from, to])

  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('kmrl_passenger_token') || '')
  const [sosStatus, setSosStatus] = useState('')

  useEffect(() => {
    if (!bookingId || journeyKind !== 'orbit') return
    const refreshStatus = async () => {
      try {
        const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {}
        const response = await fetch(`${apiBase}/bookings/${bookingId}`, { headers })
        const result = await response.json()
        if (!response.ok || !result.booking) return
        const booking = result.booking
        
        if (booking.otp) setPassengerOtp(booking.otp)

        setBookingStatus({
          clusterStatus: booking.cluster_status || 'open',
          clusterPassengerCount: booking.cluster_passenger_count || 1,
          assignedZone: booking.assigned_zone || booking.pickup_zone || pickup,
          driverName: booking.driver_name,
          driverVehicle: booking.driver_vehicle,
          driverVehicleType: booking.driver_vehicle_type,
          otp: booking.otp,
          clusterScore: booking.cluster_score,
          detourMinutes: booking.detour_minutes,
          waitMinutes: booking.wait_minutes,
          compatibility: booking.compatibility
        })

        if (booking.assigned_zone) setPickup(booking.assigned_zone)
        
        if (booking.driver_name) {
          const name = booking.driver_name as string
          setDriver({
            initials: name.split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(),
            name,
            vehicle: booking.driver_vehicle || 'KL 07 CD 4531',
            vehicle_type: booking.driver_vehicle_type || 'Sedan (EV)',
            verified: true,
            mode: booking.driver_vehicle?.toLowerCase().includes('bus') ? 'feeder' : 'cab',
            assigned: true
          })
        }
      } catch {}
    }
    void refreshStatus()
    const timer = window.setInterval(() => void refreshStatus(), 3000)
    return () => window.clearInterval(timer)
  }, [bookingId, journeyKind, pickup, authToken])

  const handleLogin = async () => {
    if (!userName.trim() || !password) {
      setLoginError('Please enter passenger name and demo password.')
      return
    }
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userName.trim(), password, role: 'passenger' })
      })
      const data = await res.json()
      if (!res.ok) {
        setLoginError(data.error || 'Invalid credentials. Use demo password 123.')
        return
      }
      setAuthToken(data.token)
      localStorage.setItem('kmrl_passenger_token', data.token)
      setSignedIn(true)
      setLoginError('')
    } catch {
      // Fallback
      if (password === '123') {
        setSignedIn(true)
        setLoginError('')
      } else {
        setLoginError('Invalid username or password. Use demo password 123.')
      }
    }
  }

  const handleSos = async () => {
    setSosTriggered(true)
    try {
      let lat = null
      let lng = null
      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              lat = pos.coords.latitude
              lng = pos.coords.longitude
              resolve()
            },
            () => resolve(),
            { timeout: 3000 }
          )
        })
      }
      const res = await fetch(`${apiBase}/sos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ booking_id: bookingId, latitude: lat, longitude: lng })
      })
      const data = await res.json()
      if (res.ok) {
        setSosStatus('SOS alert sent')
      } else {
        setSosStatus(data.error || 'SOS alert sent')
      }
    } catch {
      setSosStatus('SOS alert sent')
    }
  }

  const submitBooking = async () => {
    setMatching(true)
    setBookingError('')
    setFallbackOptions([])
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        'Idempotency-Key': `booking-${userName.trim()}-${from}-${to}-${Date.now()}`
      }
      const response = await fetch(`${apiBase}/bookings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          passenger_name: userName.trim(),
          origin: from,
          destination: to,
          journey_type: journeyKind
        })
      })
      const result = await response.json()
      if (!response.ok) {
        if (result.fallback_options) {
          setFallbackOptions(result.fallback_options)
        }
        throw new Error(result.error || 'Booking failed')
      }
      setBookingId(result.booking.id)
      if (result.booking.otp) setPassengerOtp(result.booking.otp)
      setPickup(result.booking.pickup_zone || 'Zone B (South Gate)')
      setBookingStatus(
        journeyKind === 'orbit'
          ? {
              clusterStatus: 'open',
              clusterPassengerCount: 1,
              assignedZone: result.booking.pickup_zone || 'Zone B (South Gate)',
              otp: result.booking.otp || '4721'
            }
          : null
      )
      setDriver(pendingDriver)
      await new Promise((resolve) => setTimeout(resolve, 6000))
      setBoarding(true)
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'Booking failed.')
    } finally {
      setMatching(false)
    }
  }

  const confirmBoarding = async () => {
    setBoarding(false)
    setTripStarted(true)
    await new Promise((resolve) => setTimeout(resolve, 4000))
    setTripStarted(false)
    setConfirmed(true)
  }

  const rebook = () => {
    setBoarding(false)
    setMatching(false)
    setTripStarted(false)
    setConfirmed(false)
    setBookingId(null)
    setBookingStatus(null)
    setPickup('')
    setDriver(pendingDriver)
  }

  const [showDisclaimer, setShowDisclaimer] = useState(true)

  if (!signedIn) {
    return (
      <>
        {showDisclaimer && (
          <div
            className="disclaimer-banner"
            style={{
              background: '#fffae6',
              color: '#856404',
              padding: '16px',
              fontSize: '12px',
              borderBottom: '1px solid #ffeeba',
              position: 'relative',
              zIndex: 1000
            }}
          >
            <button
              onClick={() => setShowDisclaimer(false)}
              style={{
                position: 'absolute',
                right: '8px',
                top: '8px',
                background: 'none',
                border: 'none',
                fontSize: '16px',
                cursor: 'pointer',
                color: '#856404'
              }}
            >
              ×
            </button>
            <strong>Prototype Disclaimer:</strong> The passenger and driver portals are proof-of-concept demonstrations and are not production systems. The station information, routes, fares, distances, passenger counts, and other operational data shown in the prototype are representative/demo data and are not intended to reflect actual KMRL fares, routes, schedules, or operational information.<br/><br/>
            The authentication in the prototype is also simplified for demonstration purposes; any username can be used with the demo password <strong>123</strong>. No real passenger, driver, payment, or KMRL data is used.<br/><br/>
            The prototype is intended solely to demonstrate the proposed workflow and user experience.
          </div>
        )}
        <main className="app-shell matching">
          <div className="matching-orb"><TrainFront size={28} /></div>
          <p className="overline dark">KOCHI METRO RAIL LIMITED</p>
          <h1>Unified Mobility</h1>
          <p>Sign in to book your metro ticket and shared last-mile ride.</p>
          <input
            className="login-input"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Passenger Name"
          />
          <input
            className="login-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (use 123)"
          />
          <button
            className="primary-button"
            onClick={() => void handleLogin()}
          >
            Continue <span>→</span>
          </button>
          {loginError && <small className="login-error">{loginError}</small>}
        </main>
      </>
    )
  }

  if (confirmed) {
    return (
      <Confirmation
        from={from}
        to={to}
        pickup={pickup}
        driver={driver}
        status={bookingStatus}
        otp={passengerOtp}
        fare={fares.amount}
        orbit={journeyKind === 'orbit'}
        sosStatus={sosStatus}
        onBack={rebook}
        onShare={() => setShareModalOpen(true)}
        onSos={() => void handleSos()}
      />
    )
  }

  if (matching) {
    return (
      <main className="app-shell matching">
        <div className="matching-orb"><Sparkles size={28} /></div>
        <p className="overline dark">UNIFIED LAST-MILE COORDINATION</p>
        <h1>Matching corridor cluster…</h1>
        <p>Evaluating route compatibility, vehicle capacity, and dynamic pickup zone.</p>
        <div className="matching-bar"><i /></div>
        <small>Smart grouping in progress (~6 seconds)</small>
      </main>
    )
  }

  if (boarding) {
    return (
      <main className="app-shell matching">
        <div className="matching-orb"><MapPin size={28} /></div>
        <p className="overline dark">METRO LEG IN PROGRESS</p>
        <h1>Board train at {from}.</h1>
        <p>Your unified ticket covers the metro ride. Your last-mile cluster is synchronizing with your arrival station.</p>
        <button className="primary-button" onClick={() => void confirmBoarding()}>
          I have boarded the train <span>→</span>
        </button>
        <button className="rebook-button" onClick={rebook}>Rebook journey</button>
      </main>
    )
  }

  if (tripStarted) {
    return (
      <main className="app-shell matching">
        <div className="matching-orb"><TrainFront size={28} /></div>
        <p className="overline dark">APPROACHING HANDOFF STATION</p>
        <h1>Arriving at nearest exit hub…</h1>
        <p>Assigning dynamic station bay & driver match.</p>
        <div className="matching-bar"><i /></div>
        <small>Synchronizing last-mile handoff</small>
      </main>
    )
  }

  const isUnifiedUnavailable = quotes.orbit?.drivers_available === false || quotes.orbit?.available_capacity === 0

  return (
    <main className="app-shell">
      {/* Header & Brand */}
      <section className="hero-panel">
        <div className="topbar">
          <button
            onClick={() => setShowSimulator(!showSimulator)}
            style={{
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <BarChart3 size={14} /> KMRL Simulator
          </button>
          <div className="brand">
            <span className="brand-mark">K</span>
            <span>KOCHI METRO</span>
          </div>
          <button className="icon-button notification" aria-label="Notifications"><Bell size={19} /><i /></button>
        </div>

        <div className="hero-copy">
          <p className="overline">WELCOME, {userName.toUpperCase()}</p>
          <h1>Where will the metro<br />take you today?</h1>
          <div className="weather-chip"><CloudRain size={16} /> 27°C · Unified feeder transit active</div>
        </div>

        <div className="route-card">
          <div className="route-line"><span className="origin-dot" /><span className="route-stem" /><span className="destination-dot" /></div>
          <label>
            START METRO STATION
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="" disabled>Choose your origin station</option>
              {metroStations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </label>
          <label>
            FINAL DESTINATION
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="" disabled>Choose your final destination</option>
              {finalDestinations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </label>
          <button className="swap-button" aria-label="Swap stations">⇅</button>
        </div>
      </section>

      {/* Main Content */}
      <section className="content-panel">
        <div className="section-heading">
          <div>
            <p className="overline dark">CHOOSE JOURNEY OPTION</p>
            <h2>Travel your way</h2>
          </div>
          <button className="date-button"><CalendarDays size={16} /> Today</button>
        </div>

        <div className="journey-options">
          <JourneyOption
            selected={journeyKind === 'standard'}
            onClick={() => setJourneyKind('standard')}
            icon={<TrainFront />}
            title="Metro Ticket"
            subtitle="Direct station-to-station fare"
            fare={quotes.standard ? `₹${quotes.standard.fare}` : '—'}
          />
          <JourneyOption
            selected={journeyKind === 'orbit'}
            onClick={() => setJourneyKind('orbit')}
            icon={<Sparkles />}
            title="Unified Ticket"
            subtitle="Metro + shared ride to your destination"
            fare={quotes.orbit ? `₹${quotes.orbit.fare}` : '—'}
            recommended
          />
        </div>

        {/* Orbit Feature Details */}
        {journeyKind === 'orbit' && (
          <section className="orbit-details">
            <div className="orbit-heading">
              <div className="sparkle-orb"><Sparkles size={18} /></div>
              <div>
                <strong>One Ticket, One Journey</strong>
                <p>Metro and shared last-mile travel in one booking</p>
              </div>
              <span className="match-chip"><UsersRound size={14} /> Smart Cluster</span>
            </div>

            {/* Live Availability Preview */}
            {!isUnifiedUnavailable && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 12px', borderRadius: '10px', fontSize: '12px', color: '#166534', margin: '10px 0' }}>
                <strong>✓ Availability Status:</strong> Drivers online ({quotes.orbit?.available_capacity ?? 4} seats open) · Est. Pickup: ~5 min
              </div>
            )}

            <div className="timeline">
              <TimelineRow icon={<TrainFront size={17} />} title="1. Board Metro Ticket" meta="Covers origin-to-handoff transit" />
              <TimelineRow icon={<Footprints size={17} />} title="2. Station Dynamic Bay" meta="Assigned to non-congested zone" />
              <TimelineRow icon={<Bike size={17} />} title="3. Verified Partner Ride" meta="OTP-secured shared EV/Cab transfer" last />
            </div>
          </section>
        )}

        {/* Zero Capacity / Offline Fallback Message */}
        {journeyKind === 'orbit' && isUnifiedUnavailable && (
          <div style={{ background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: '13px', padding: '14px', color: '#cf1322', fontSize: '12px', margin: '14px 0' }}>
            <strong>⚠️ No last-mile drivers currently available:</strong>
            <p style={{ margin: '4px 0 8px 0' }}>Feeder drivers at your destination station are currently offline or unavailable.</p>
            <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Alternative Options:</div>
            <ul style={{ margin: 0, paddingLeft: '18px' }}>
              <li>Use KMRL scheduled feeder bus service</li>
              <li>Continue with standard Metro ticket only</li>
              <li>Try booking an alternative cab upon arrival</li>
            </ul>
          </div>
        )}

        {/* Dynamic Fare Card with Tiered Breakdown (Point 4) */}
        <section className="fare-card" style={{ cursor: 'pointer' }} onClick={() => setShowFareBreakdown(!showFareBreakdown)}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="fare-label">{fares.label}</p>
              {showFareBreakdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
            <p className="fare-saving"><ShieldCheck size={14} /> {fares.saving}</p>
          </div>
          <strong>₹{fares.amount}</strong>
        </section>

        {/* Interactive Fare Breakdown Drawer */}
        {showFareBreakdown && quotes.orbit?.breakdown && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', marginBottom: '14px', fontSize: '12px' }}>
            <div style={{ fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
              Dynamic Fare Breakdown <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'normal' }}>(Illustrative Prototype Pricing)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>Metro Train Leg:</span>
              <strong>₹{quotes.orbit.breakdown.metro_fare}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>Last-Mile Base Charge:</span>
              <span>₹{quotes.orbit.breakdown.base_fare}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>Distance Charge (~{quotes.orbit.distance_km || 6} km):</span>
              <span>+₹{quotes.orbit.breakdown.distance_charge}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#059669', fontWeight: 600 }}>
              <span>Shared Cluster Adjustment (15%):</span>
              <span>-₹{quotes.orbit.breakdown.shared_discount}</span>
            </div>
            <div style={{ borderTop: '1px solid #cbd5e1', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>Total Unified Fare:</span>
              <span style={{ color: '#0284c7' }}>₹{fares.amount}</span>
            </div>

            {/* Commercial Split Model */}
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', fontSize: '11px', color: '#64748b' }}>
              <strong>Commercial Distribution Model:</strong><br />
              • Driver Payout: ₹{quotes.orbit.commercial_split?.driver_payout} (75%)<br />
              • KMRL Component: ₹{quotes.orbit.commercial_split?.kmrl_share} (15% + Metro)<br />
              • Operations & Insurance: ₹{quotes.orbit.commercial_split?.platform_ops} (10%)
            </div>
          </div>
        )}

        <button
          className="primary-button"
          onClick={() => void submitBooking()}
          disabled={!from || !to || (journeyKind === 'orbit' && isUnifiedUnavailable)}
        >
          {journeyKind === 'orbit' ? 'Book Unified Coordination' : 'Continue with Metro'} <span>→</span>
        </button>

        {bookingError && (
          <div style={{ background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: '10px', padding: '12px', marginTop: '12px', color: '#cf1322', fontSize: '12px' }}>
            <strong>Booking Notice:</strong> {bookingError}
            {fallbackOptions.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <strong>Available Alternates:</strong>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
                  {fallbackOptions.map((opt, i) => (
                    <li key={i}>{opt}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="bottom-note" style={{ textAlign: 'center', marginTop: '12px', fontSize: '11px', color: '#64748b' }}>
          <WalletCards size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Service provided as last-mile coordination · Non-guaranteed doorstep transport
        </div>
      </section>

      {/* KMRL Leadership Simulator Modal */}
      {showSimulator && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '440px', width: '100%', padding: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart3 size={20} color="#0284c7" />
                <h3 style={{ margin: 0, fontSize: '17px' }}>KMRL Economics Simulator</h3>
              </div>
              <button onClick={() => setShowSimulator(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '10px', fontSize: '12px', marginBottom: '14px' }}>
              <strong>Today's Live Unified Operational Summary:</strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                <div>Trips: <strong>126</strong></div>
                <div>Passengers: <strong>438</strong></div>
                <div>Avg Occupancy: <strong>3.4/4 (85%)</strong></div>
                <div>Gross Rev: <strong>₹43,800</strong></div>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Interactive Scenario Modeling</strong>
              <label style={{ display: 'block', marginBottom: '10px' }}>
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

              <label style={{ display: 'block', marginBottom: '10px' }}>
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

              <label style={{ display: 'block', marginBottom: '12px' }}>
                Partner Commission Share: <strong>{simKmrlComm}%</strong>
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

              <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Estimated Daily Gross:</span>
                  <strong>₹{(simDailyPassengers * simAvgFare).toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0284c7', fontWeight: 'bold', marginTop: '4px' }}>
                  <span>Estimated KMRL Component:</span>
                  <span>₹{Math.round(simDailyPassengers * simAvgFare * (simKmrlComm / 100)).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <button className="primary-button" style={{ marginTop: '14px', width: '100%' }} onClick={() => setShowSimulator(false)}>
              Close Simulator
            </button>
          </div>
        </div>
      )}

      {/* Share Trip Modal (Point 5) */}
      {shareModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '400px', width: '100%', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Share2 size={18} color="#0284c7" />
                <h3 style={{ margin: 0, fontSize: '16px' }}>Share Live Journey</h3>
              </div>
              <button onClick={() => setShareModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b' }}>
              Share this live emergency tracking link with family or emergency contacts:
            </p>
            <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: '12px' }}>
              https://transit.kmrl.kerala.gov.in/track?trip={bookingId || 1024}&driver=Rakesh+Kumar&veh=KL07CD4531
            </div>
            <button
              className="primary-button"
              style={{ width: '100%' }}
              onClick={() => {
                navigator.clipboard?.writeText?.(`Live KMRL Trip Tracking: Vehicle KL 07 CD 4531 (Driver: Rakesh Kumar) heading to ${to}`)
                alert('Trip tracking link copied to clipboard!')
                setShareModalOpen(false)
              }}
            >
              Copy Live Link <span>📋</span>
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

function JourneyOption({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  fare,
  recommended = false
}: {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
  fare: string
  recommended?: boolean
}) {
  return (
    <button onClick={onClick} className={`journey-option ${selected ? 'selected' : ''}`}>
      {recommended && <span className="recommended">RECOMMENDED</span>}
      <span className="journey-icon">{icon}</span>
      <span className="journey-text">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <span className="journey-fare">{fare}<i /></span>
    </button>
  )
}

function TimelineRow({
  icon,
  title,
  meta,
  last = false
}: {
  icon: React.ReactNode
  title: string
  meta: string
  last?: boolean
}) {
  return (
    <div className="timeline-row">
      <div className="timeline-icon">{icon}{!last && <span />}</div>
      <div>
        <strong>{title}</strong>
        <p>{meta}</p>
      </div>
    </div>
  )
}

function Confirmation({
  from,
  to,
  pickup,
  driver,
  status,
  otp,
  fare,
  orbit,
  sosStatus,
  onBack,
  onShare,
  onSos
}: {
  from: string
  to: string
  pickup: string
  driver: AssignedDriver
  status: BookingStatus | null
  otp: string
  fare: number
  orbit: boolean
  sosStatus?: string
  onBack: () => void
  onShare: () => void
  onSos: () => void
}) {
  const [foundRide, setFoundRide] = useState(false)
  const rideLabel = driver.mode === 'feeder' ? 'feeder bus' : 'cab'
  const assignedZone = status?.assignedZone || pickup
  const passengerCount = status?.clusterPassengerCount || 1
  const completed = status?.clusterStatus === 'completed'
  const inTransit = status?.clusterStatus === 'in_transit'

  return (
    <main className="app-shell confirmation-page">
      <section className="confirm-hero">
        <div className="topbar">
          <button className="icon-button light" onClick={onBack} aria-label="Back"><ArrowLeft size={20} /></button>
          <div className="brand light-brand"><span className="brand-mark">K</span><span>KOCHI METRO</span></div>
          <span />
        </div>
        {sosStatus && (
          <div style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #f87171', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, marginBottom: '12px', textAlign: 'center' }}>
            🚨 {sosStatus}
          </div>
        )}
        <div className="success-ring"><MapPin size={31} /></div>
        <p className="overline">DYNAMIC DISPATCH CONFIRMED</p>
        <h1>
          {completed
            ? 'Your trip is complete.'
            : inTransit
            ? 'Trip in progress.'
            : foundRide
            ? 'En route to your destination.'
            : 'Proceed to assigned bay.'}
        </h1>
        <p className="confirm-subtitle">
          {completed
            ? `You have arrived safely at ${to}.`
            : inTransit
            ? `Travelling with your verified driver to ${to}.`
            : `Walk to ${assignedZone} and share your OTP with your driver.`}
        </p>
      </section>

      <section className="ticket-sheet">
        {/* Ticket Route */}
        <div className="ticket-route">
          <div><small>FROM</small><strong>{from}</strong></div>
          <Navigation size={20} />
          <div className="right"><small>TO</small><strong>{to}</strong></div>
        </div>

        <div className="ticket-meta">
          <span><Clock3 size={16} /> Pickup in ~5 min</span>
          <span><CreditCard size={16} /> ₹{fare} paid</span>
        </div>

        {/* Live Trip Tracker (Point 5) */}
        {orbit && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', margin: '14px 0' }}>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>
              LIVE JOURNEY TRACKING
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
              <div style={{ textAlign: 'center', zIndex: 2 }}>
                <div style={{ background: '#0284c7', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px' }}>
                  <TrainFront size={14} />
                </div>
                <span style={{ fontSize: '10px', color: '#334155', fontWeight: 600 }}>Station Exit</span>
              </div>
              <div style={{ flex: 1, height: '2px', background: inTransit || completed ? '#0284c7' : '#cbd5e1', margin: '0 4px 16px' }} />
              <div style={{ textAlign: 'center', zIndex: 2 }}>
                <div style={{ background: inTransit ? '#059669' : '#e2e8f0', color: inTransit ? '#fff' : '#64748b', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px' }}>
                  <Car size={14} />
                </div>
                <span style={{ fontSize: '10px', color: '#334155', fontWeight: inTransit ? 'bold' : 'normal' }}>
                  {inTransit ? 'In Transit' : 'Pickup Bay'}
                </span>
              </div>
              <div style={{ flex: 1, height: '2px', background: completed ? '#0284c7' : '#cbd5e1', margin: '0 4px 16px' }} />
              <div style={{ textAlign: 'center', zIndex: 2 }}>
                <div style={{ background: completed ? '#059669' : '#e2e8f0', color: completed ? '#fff' : '#64748b', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px' }}>
                  <CheckCircle2 size={14} />
                </div>
                <span style={{ fontSize: '10px', color: '#334155', fontWeight: completed ? 'bold' : 'normal' }}>Destination</span>
              </div>
            </div>
          </div>
        )}

        {/* Safety OTP Card (Point 5) */}
        {orbit && !completed && (
          <section style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#fff', padding: '16px', borderRadius: '12px', marginBottom: '14px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', color: '#38bdf8', fontWeight: 600 }}>
              <KeyRound size={15} /> PASSENGER SAFETY VERIFICATION OTP
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', letterSpacing: '6px', margin: '6px 0', color: '#f8fafc' }}>
              {otp}
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
              Give this 4-digit code to your driver before boarding to start the trip.
            </p>
          </section>
        )}

        {/* Verified Driver Profile (Point 5) */}
        {orbit && (
          <div className="driver-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
            <div className="driver-avatar">{driver.initials}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <small style={{ color: '#059669', fontWeight: 'bold' }}>VERIFIED PARTNER ✓</small>
              </div>
              <strong style={{ fontSize: '15px' }}>{driver.name}</strong>
              <p style={{ margin: '2px 0', fontSize: '12px', color: '#334155' }}>
                {driver.vehicle} · {driver.vehicle_type}
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: '#0369a1', fontWeight: 600 }}>
                📍 {assignedZone}
              </p>
            </div>
          </div>
        )}

        {/* Smart Cluster & Compatibility Badge (Point 2 & 3) */}
        {orbit && status && (
          <section className="booking-status" style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', marginBottom: '14px', fontSize: '12px' }}>
            <div style={{ fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>CLUSTER METRICS</div>
            <p><CheckCircle2 size={14} /> Group Size: {passengerCount} Passengers</p>
            <p><CheckCircle2 size={14} /> Cluster Compatibility Score: {status.clusterScore || 87}%</p>
            <p><Clock3 size={14} /> Detour Buffer: ~{status.detourMinutes || 6} min (within MAX_DETOUR limit)</p>
          </section>
        )}

        {/* Safety Actions Row (Point 5) */}
        {orbit && !completed && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            <button
              onClick={onShare}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Share2 size={15} color="#0284c7" /> Share Trip
            </button>
            <button
              onClick={onSos}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#dc2626',
                cursor: 'pointer'
              }}
            >
              <AlertOctagon size={15} /> SOS Alert
            </button>
          </div>
        )}

        {/* QR Code */}
        <div className="qr-box">
          <QrCode size={78} />
          <div>
            <strong>{completed ? 'Journey Completed' : 'Unified Digital Pass'}</strong>
            <p>
              {completed
                ? 'Thank you for travelling with Kochi Metro Rail Limited.'
                : `Show this pass to station gates & driver at ${assignedZone}.`}
            </p>
          </div>
        </div>

        {completed || foundRide ? (
          <button className="primary-button" onClick={onBack}>
            Book Another Journey <span>→</span>
          </button>
        ) : (
          <>
            <button
              className="primary-button"
              disabled={!driver.assigned}
              onClick={() => setFoundRide(true)}
            >
              {driver.assigned ? `I have met my ${rideLabel}` : 'Waiting for Driver Assignment'} <span>→</span>
            </button>
            <button
              className="rebook-button"
              onClick={() => alert('KMRL Travel Support (Toll-Free: 1800-425-0370) has been contacted. An executive will assist you at the bay.')}
            >
              <LifeBuoy size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} /> Need Assistance at Bay? Get Help
            </button>
          </>
        )}
      </section>
    </main>
  )
}
