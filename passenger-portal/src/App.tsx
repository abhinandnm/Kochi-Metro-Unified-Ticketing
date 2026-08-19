import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Bell, Bike, CalendarDays, CheckCircle2, Clock3, CloudRain, CreditCard, Footprints, MapPin, Navigation, QrCode, ShieldCheck, Sparkles, TrainFront, UsersRound, WalletCards } from 'lucide-react'

type JourneyKind = 'standard' | 'orbit'
type AssignedDriver = { initials: string; name: string; vehicle: string; mode: 'cab' | 'feeder'; assigned: boolean }
type BookingStatus = { clusterStatus: string; clusterPassengerCount: number; assignedZone: string; driverName?: string }
type FareQuote = { fare: number; metro_fare: number; last_mile_fare: number }

const metroStations = ['Aluva Metro Station', 'Edappally Metro Station', 'Kaloor Metro Station', 'MG Road Metro Station', 'Maharaja’s College Metro Station', 'Vyttila Metro Station', 'Pettta Metro Station']
const finalDestinations = ['Lulu Mall, Edappally', 'Vyttila Mobility Hub', 'MG Road, Kochi', 'Marine Drive, Kochi', 'Fort Kochi', 'Infopark, Kakkanad', 'SmartCity, Kakkanad', 'Tripunithura']
const pendingDriver: AssignedDriver = { initials: '…', name: 'Driver assignment in progress', vehicle: 'Your zone is reserved', mode: 'feeder', assigned: false }
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
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [bookingError, setBookingError] = useState('')
  const [quotes, setQuotes] = useState<{ standard?: FareQuote; orbit?: FareQuote }>({})

  const fares = useMemo(() => {
    const quote = quotes[journeyKind]
    return journeyKind === 'orbit'
      ? { amount: quote?.fare ?? 0, label: quote ? `Metro ₹${quote.metro_fare} + shared last mile ₹${quote.last_mile_fare}` : 'Choose a route for an estimated fare', saving: 'Shared ride fare included' }
      : { amount: quote?.fare ?? 0, label: quote ? 'Metro ticket · route-based fare' : 'Choose a route for an estimated fare', saving: 'Best value metro fare' }
  }, [journeyKind, quotes])

  useEffect(() => {
    if (!from || !to) { setQuotes({}); return }
    const loadQuotes = async () => {
      try {
        const quoteFor = async (kind: JourneyKind) => {
          const response = await fetch(`${apiBase}/journeys/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: from, destination: to, journey_type: kind }) })
          if (!response.ok) throw new Error('Unable to estimate fare.')
          return response.json() as Promise<FareQuote>
        }
        const [standard, orbit] = await Promise.all([quoteFor('standard'), quoteFor('orbit')])
        setQuotes({ standard, orbit })
      } catch { setQuotes({}) }
    }
    void loadQuotes()
  }, [from, to])

  useEffect(() => {
    if (!bookingId || journeyKind !== 'orbit') return
    const refreshStatus = async () => {
      try {
        const response = await fetch(`${apiBase}/bookings/${bookingId}`)
        const result = await response.json()
        if (!response.ok || !result.booking) return
        const booking = result.booking
        setBookingStatus({ clusterStatus: booking.cluster_status || 'open', clusterPassengerCount: booking.cluster_passenger_count || 1, assignedZone: booking.assigned_zone || booking.pickup_zone || pickup, driverName: booking.driver_name })
        if (booking.assigned_zone) setPickup(booking.assigned_zone)
        if (booking.driver_name) {
          const name = booking.driver_name as string
          setDriver({ initials: name.split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(), name, vehicle: booking.driver_vehicle || 'Kochi Metro feeder', mode: 'feeder', assigned: true })
        }
      } catch { /* Poll again on the next interval. */ }
    }
    void refreshStatus()
    const timer = window.setInterval(() => void refreshStatus(), 3000)
    return () => window.clearInterval(timer)
  }, [bookingId, journeyKind, pickup])

  const submitBooking = async () => {
    setMatching(true); setBookingError('')
    try {
      const response = await fetch(`${apiBase}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passenger_name: userName.trim(), origin: from, destination: to, journey_type: journeyKind }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Booking failed')
      setBookingId(result.booking.id)
      setQuotes((current) => ({ ...current, [journeyKind]: { fare: result.booking.fare, metro_fare: current[journeyKind]?.metro_fare || 0, last_mile_fare: current[journeyKind]?.last_mile_fare || 0 } }))
      setPickup(result.booking.pickup_zone || '')
      setBookingStatus(journeyKind === 'orbit' ? { clusterStatus: 'open', clusterPassengerCount: 1, assignedZone: result.booking.pickup_zone || '' } : null)
      setDriver(pendingDriver)
      await new Promise((resolve) => setTimeout(resolve, 10000))
      setBoarding(true)
    } catch (error) { setBookingError(error instanceof Error ? error.message : 'Unable to reach the booking service. Please try again.') }
    finally { setMatching(false) }
  }

  const confirmBoarding = async () => { setBoarding(false); setTripStarted(true); await new Promise((resolve) => setTimeout(resolve, 5000)); setTripStarted(false); setConfirmed(true) }
  const rebook = () => { setBoarding(false); setMatching(false); setTripStarted(false); setConfirmed(false); setBookingId(null); setBookingStatus(null); setPickup(''); setDriver(pendingDriver) }

  const [showDisclaimer, setShowDisclaimer] = useState(true)

  if (!signedIn) return (
    <>
      {showDisclaimer && (
        <div className="disclaimer-banner" style={{ background: '#fffae6', color: '#856404', padding: '16px', fontSize: '12px', borderBottom: '1px solid #ffeeba', position: 'relative', zIndex: 1000 }}>
          <button onClick={() => setShowDisclaimer(false)} style={{ position: 'absolute', right: '8px', top: '8px', background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#856404' }}>×</button>
          <strong>Prototype Disclaimer:</strong> The passenger and driver portals are proof-of-concept demonstrations and are not production systems. The station information, routes, fares, distances, passenger counts, and other operational data shown in the prototype are representative/demo data and are not intended to reflect actual KMRL fares, routes, schedules, or operational information.<br/><br/>
          The authentication in the prototype is also simplified for demonstration purposes; any username can be used with the demo password <strong>123</strong>. No real passenger, driver, payment, or KMRL data is used.<br/><br/>
          The prototype is intended solely to demonstrate the proposed workflow and user experience.
        </div>
      )}
      <main className="app-shell matching">
        <div className="matching-orb"><TrainFront size={28} /></div>
        <p className="overline dark">KOCHI METRO</p>
        <h1>Welcome aboard.</h1>
        <p>Sign in to begin your unified journey.</p>
        <input className="login-input" value={userName} onChange={(event) => setUserName(event.target.value)} placeholder="Username" />
        <input className="login-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
        <button className="primary-button" onClick={() => { if (userName.trim() && password === '123') { setSignedIn(true); setLoginError('') } else setLoginError('Invalid username or password.') }}>Continue <span>→</span></button>
        {loginError && <small className="login-error">{loginError}</small>}
      </main>
    </>
  )
  if (confirmed) return <Confirmation from={from} to={to} pickup={pickup} driver={driver} status={bookingStatus} fare={fares.amount} orbit={journeyKind === 'orbit'} onBack={rebook} />
  if (matching) return <main className="app-shell matching"><div className="matching-orb"><Sparkles size={28} /></div><p className="overline dark">UNIFIED BOOKING</p><h1>Preparing your unified journey…</h1><p>We are reserving your metro ticket and last-mile ride.</p><div className="matching-bar"><i /></div><small>This takes about 10 seconds</small></main>
  if (boarding) return <main className="app-shell matching"><div className="matching-orb"><MapPin size={28} /></div><p className="overline dark">NEXT STEP</p><h1>Head over to {from}.</h1><p>Have you boarded the metro at {from}?</p><button className="primary-button" onClick={() => void confirmBoarding()}>Yes, I have boarded <span>→</span></button><button className="rebook-button" onClick={rebook}>Rebook journey</button></main>
  if (tripStarted) return <main className="app-shell matching"><div className="matching-orb"><TrainFront size={28} /></div><p className="overline dark">UNIFIED BOOKING</p><h1>Your metro journey has started.</h1><p>We will reveal your pickup zone when you arrive at the nearest station.</p><div className="matching-bar"><i /></div><small>Travelling towards your handoff station</small></main>

  return <main className="app-shell"><section className="hero-panel"><div className="topbar"><span /><div className="brand"><span className="brand-mark">K</span><span>KOCHI METRO</span></div><button className="icon-button notification" aria-label="Notifications"><Bell size={19} /><i /></button></div><div className="hero-copy"><p className="overline">GOOD EVENING, {userName.toUpperCase()}</p><h1>Where will the metro<br />take you today?</h1><div className="weather-chip"><CloudRain size={16} /> 27°C · Light rain near Aluva</div></div><div className="route-card"><div className="route-line"><span className="origin-dot" /><span className="route-stem" /><span className="destination-dot" /></div><label>START METRO STATION<select value={from} onChange={(event) => setFrom(event.target.value)}><option value="" disabled>Choose your station</option>{metroStations.map((location) => <option key={location} value={location}>{location}</option>)}</select></label><label>FINAL DESTINATION<select value={to} onChange={(event) => setTo(event.target.value)}><option value="" disabled>Choose your destination</option>{finalDestinations.map((location) => <option key={location} value={location}>{location}</option>)}</select></label><button className="swap-button" aria-label="Swap stations">⇅</button></div></section><section className="content-panel"><div className="section-heading"><div><p className="overline dark">CHOOSE YOUR JOURNEY</p><h2>Travel your way</h2></div><button className="date-button"><CalendarDays size={16} /> Today</button></div><div className="journey-options"><JourneyOption selected={journeyKind === 'standard'} onClick={() => setJourneyKind('standard')} icon={<TrainFront />} title="Metro ticket" subtitle="Simple, direct, lowest fare" fare={quotes.standard ? `₹${quotes.standard.fare}` : '₹42'} /><JourneyOption selected={journeyKind === 'orbit'} onClick={() => setJourneyKind('orbit')} icon={<Sparkles />} title="Unified Booking" subtitle="Metro + a shared ride to your door" fare={quotes.orbit ? `₹${quotes.orbit.fare}` : '₹78'} recommended /></div>{journeyKind === 'orbit' && <section className="orbit-details"><div className="orbit-heading"><div className="sparkle-orb"><Sparkles size={18} /></div><div><strong>One ticket, one journey</strong><p>Metro and shared last-mile travel in one booking</p></div><span className="match-chip"><UsersRound size={14} /> Smart grouping</span></div><div className="timeline"><TimelineRow icon={<TrainFront size={17} />} title="Board at your metro station" meta="Your ticket covers the metro segment" /><TimelineRow icon={<Footprints size={17} />} title="Arrive at the nearest metro station" meta="Zone guidance appears only after arrival" /><TimelineRow icon={<Bike size={17} />} title="Share the last mile" meta="Destination-aware feeder ride" last /></div></section>}<section className="fare-card"><div><p className="fare-label">{fares.label}</p><p className="fare-saving"><ShieldCheck size={14} /> {fares.saving}</p></div><strong>₹{fares.amount}</strong></section><button className="primary-button" onClick={() => void submitBooking()} disabled={!from || !to}>{journeyKind === 'orbit' ? 'Book unified journey' : 'Continue with metro'} <span>→</span></button>{bookingError && <p className="booking-error">{bookingError}</p>}<div className="bottom-note"><WalletCards size={16} /> Payment stays together in one secure checkout</div></section></main>
}

function JourneyOption({ selected, onClick, icon, title, subtitle, fare, recommended = false }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string; fare: string; recommended?: boolean }) {
  return <button onClick={onClick} className={`journey-option ${selected ? 'selected' : ''}`}>{recommended && <span className="recommended">RECOMMENDED</span>}<span className="journey-icon">{icon}</span><span className="journey-text"><strong>{title}</strong><small>{subtitle}</small></span><span className="journey-fare">{fare}<i /></span></button>
}

function TimelineRow({ icon, title, meta, last = false }: { icon: React.ReactNode; title: string; meta: string; last?: boolean }) {
  return <div className="timeline-row"><div className="timeline-icon">{icon}{!last && <span />}</div><div><strong>{title}</strong><p>{meta}</p></div></div>
}

function Confirmation({ from, to, pickup, driver, status, fare, orbit, onBack }: { from: string; to: string; pickup: string; driver: AssignedDriver; status: BookingStatus | null; fare: number; orbit: boolean; onBack: () => void }) {
  const [foundRide, setFoundRide] = useState(false)
  const rideLabel = driver.mode === 'feeder' ? 'feeder' : 'cab'
  const assignedZone = status?.assignedZone || pickup
  const passengerCount = status?.clusterPassengerCount || 1
  const completed = status?.clusterStatus === 'completed'
  return <main className="app-shell confirmation-page"><section className="confirm-hero"><div className="topbar"><button className="icon-button light" onClick={onBack} aria-label="Back"><ArrowLeft size={20} /></button><div className="brand light-brand"><span className="brand-mark">K</span><span>KOCHI METRO</span></div><span /></div><div className="success-ring"><MapPin size={31} /></div><p className="overline">YOUR PICKUP ZONE IS READY</p><h1>{completed ? 'Your trip is complete.' : foundRide ? 'Thank you for using Kochi Metro.' : 'Go to your assigned zone.'}</h1><p className="confirm-subtitle">{completed ? `You have arrived at ${to}.` : foundRide ? `Your ${rideLabel} will leave for ${to} shortly.` : `Walk to the zone below and wait for your assigned ${rideLabel}.`}</p></section><section className="ticket-sheet"><div className="ticket-route"><div><small>FROM</small><strong>{from}</strong></div><Navigation size={20} /><div className="right"><small>TO</small><strong>{to}</strong></div></div><div className="ticket-meta"><span><Clock3 size={16} /> Depart in 14 min</span><span><CreditCard size={16} /> ₹{fare} paid</span></div>{orbit && <section className="booking-status"><small>LIVE BOOKING STATUS</small><p><CheckCircle2 size={14} /> Cluster created · {passengerCount} {passengerCount === 1 ? 'passenger' : 'passengers'}</p><p><CheckCircle2 size={14} /> {driver.assigned ? `Driver accepted your trip: ${driver.name}` : 'Waiting for a driver to accept your trip'}</p><p><MapPin size={14} /> Pickup zone: {assignedZone}</p>{completed && <p><CheckCircle2 size={14} /> Trip completed</p>}</section>}{orbit && <div className="driver-card"><div className="driver-avatar">{driver.initials}</div><div><small>{driver.assigned ? `${driver.mode.toUpperCase()} WAITING AT YOUR ZONE` : 'DRIVER ASSIGNMENT IN PROGRESS'}</small><strong>{driver.name} · {driver.vehicle}</strong><p><MapPin size={14} /> {assignedZone}</p></div><button className="icon-button"><Navigation size={18} /></button></div>}<div className="qr-box"><QrCode size={78} /><div><strong>{completed ? 'Trip completed' : foundRide ? `Leaving for ${to}` : `Have you found your ${rideLabel}?`}</strong><p>{completed ? 'Thank you for travelling with Kochi Metro.' : foundRide ? 'Your final leg is now underway.' : driver.assigned ? `Look for ${driver.name} at the assigned zone.` : 'We will notify you as soon as a driver accepts.'}</p></div></div>{completed || foundRide ? <button className="primary-button" onClick={onBack}>Book another journey <span>→</span></button> : <><button className="primary-button" disabled={!driver.assigned} onClick={() => setFoundRide(true)}>{driver.assigned ? `Yes, I found my ${rideLabel}` : 'Waiting for driver assignment'} <span>→</span></button><button className="rebook-button" onClick={() => window.alert('Kochi Metro support has been notified. A travel assistant will contact you shortly.')}>Trouble finding your travel buddy? Get help</button></>}</section></main>
}
