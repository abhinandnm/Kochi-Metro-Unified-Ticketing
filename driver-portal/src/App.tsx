import { useEffect, useMemo, useState } from 'react'
import { Bike, CheckCircle2, ChevronRight, Clock3, MapPin, Navigation, Power, Route, TrainFront, Users, Wallet } from 'lucide-react'

type TripState = 'available' | 'accepted' | 'riding' | 'complete'
type PortalView = 'trips' | 'history' | 'wallet'
type Passenger = { id: number; passenger_name: string; destination: string; status: string }
type Cluster = { id: number; origin: string; destination: string; pickup_zone: string; passenger_count: number; estimated_minutes: number; fare: number; status: 'open' | 'accepted'; driver_name?: string; passengers: Passenger[] }
type TripRecord = { id: number; route: string; earnings: number; completedAt: string }

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'

export default function App() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [online, setOnline] = useState(true)
  const [trip, setTrip] = useState<TripState>('available')
  const [activeView, setActiveView] = useState<PortalView>('trips')
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [earnings, setEarnings] = useState(0)
  const [tripHistory, setTripHistory] = useState<TripRecord[]>([])
  const [apiError, setApiError] = useState('')

  const initials = username.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'D'
  const activeCluster = useMemo(() => clusters.find((cluster) => cluster.status === 'accepted' && cluster.driver_name?.toLowerCase() === username.trim().toLowerCase()) || clusters.find((cluster) => cluster.status === 'open'), [clusters, username])

  const loadClusters = async () => {
    try {
      const response = await fetch(`${apiBase}/clusters`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load bookings.')
      setClusters(result.clusters)
      setApiError('')
    } catch (error) { setApiError(error instanceof Error ? error.message : 'Unable to load bookings.') }
  }

  useEffect(() => {
    if (!signedIn) return
    void loadClusters()
    const timer = window.setInterval(() => void loadClusters(), 3000)
    return () => window.clearInterval(timer)
  }, [signedIn])

  const openNavigation = () => {
    const station = activeCluster ? `${activeCluster.origin} Metro Station` : 'Aluva Metro Station'
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(station)}`
    const mapWindow = window.open(url, '_blank', 'noopener,noreferrer')
    if (!mapWindow) window.location.assign(url)
  }

  const advanceTrip = async () => {
    if (!activeCluster) return
    if (trip === 'available') {
      try {
        const response = await fetch(`${apiBase}/clusters/${activeCluster.id}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driver_name: username.trim() }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Cluster is unavailable.')
        setTrip('accepted')
        await loadClusters()
      } catch (error) { setApiError(error instanceof Error ? error.message : 'Unable to accept cluster.') }
    } else if (trip === 'accepted') setTrip('riding')
    else if (trip === 'riding') {
      try {
        const response = await fetch(`${apiBase}/clusters/${activeCluster.id}/complete`, { method: 'POST' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to complete trip.')
        setEarnings((current) => current + result.earnings)
        setTripHistory((current) => [{ id: activeCluster.id, route: `${activeCluster.origin} → ${activeCluster.destination}`, earnings: result.earnings, completedAt: new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date()) }, ...current])
        await loadClusters()
        setTrip('available')
      } catch (error) { setApiError(error instanceof Error ? error.message : 'Unable to complete trip.') }
    }
  }

  const toggleOnline = async () => {
    const nextState = !online
    setOnline(nextState)
    if (username.trim()) {
      try {
        await fetch(`${apiBase}/drivers/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_name: username.trim(), online: nextState })
        })
      } catch {}
    }
  }

  const handleSignIn = async () => {
    if (username.trim() && password === '123') {
      setSignedIn(true)
      setLoginError('')
      try {
        await fetch(`${apiBase}/drivers/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_name: username.trim(), online: true })
        })
      } catch {}
    } else {
      setLoginError('Invalid username or password.')
    }
  }

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
      <main className="driver-shell driver-login">
        <div className="login-logo"><TrainFront size={27} /></div>
        <small>KOCHI METRO DRIVER PORTAL</small>
        <h1>Move the city forward.</h1>
        <p>Sign in to receive nearby passenger clusters.</p>
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
        <button className="primary" onClick={() => void handleSignIn()}>Continue <ChevronRight size={20} /></button>
        {loginError && <small className="driver-error">{loginError}</small>}
      </main>
    </>
  )

  const tripsView = trip === 'complete'
    ? <section className="completed"><CheckCircle2 size={42} /><h2>Trip completed</h2><p>Your earnings have been added to the wallet.</p><button className="primary" onClick={() => setTrip('available')}>Find next cluster <ChevronRight size={20} /></button></section>
    : !activeCluster
      ? <section className="empty-state"><Users size={32} /><strong>No passenger clusters available at the moment</strong><p>New Unified Bookings will appear here automatically.</p><button className="nav-button" onClick={() => void loadClusters()}><Clock3 size={18} /> Refresh bookings</button></section>
      : <><div className="section-title"><div><small>LIVE PASSENGER CLUSTER</small><h2>{trip === 'available' ? 'Pickup available' : trip === 'accepted' ? 'Head to the station' : 'On the way together'}</h2></div><span className="cluster">{activeCluster.passenger_count} <Users size={14} /></span></div><section className="cluster-card"><div className="cluster-top"><span className="trip-icon"><Bike size={20} /></span><div><strong>{activeCluster.origin} → {activeCluster.destination}</strong><p><Clock3 size={13} /> {activeCluster.estimated_minutes} min · pickup cluster</p></div><span className="price">₹{activeCluster.fare}</span></div><div className="route-steps"><p><i /> {activeCluster.origin} Metro Station</p><p><i /> {activeCluster.pickup_zone}</p></div><div className="passenger-list"><small>PASSENGERS & FINAL DESTINATIONS</small>{activeCluster.passengers.map((passenger) => <p key={passenger.id}><strong>{passenger.passenger_name}</strong><span>{passenger.destination}</span></p>)}</div></section><button disabled={!online} className="primary" onClick={() => void advanceTrip()}>{trip === 'available' ? 'Accept cluster' : trip === 'accepted' ? 'Start pickup' : 'Complete trip'}<ChevronRight size={20} /></button><button className="nav-button" onClick={openNavigation}><Route size={18} /> Open navigation to station</button></>

  const historyView = <><div className="section-title"><div><small>RIDE HISTORY</small><h2>Completed trips</h2></div></div>{tripHistory.length === 0 ? <section className="empty-state"><Clock3 size={32} /><strong>No completed rides yet</strong><p>Complete an assigned passenger cluster to see it here.</p></section> : tripHistory.map((record) => <section className="history-card" key={record.id}><span className="trip-icon"><CheckCircle2 size={20} /></span><div><strong>{record.route}</strong><p>Completed at {record.completedAt}</p></div><span className="price">+₹{record.earnings}</span></section>)}</>
  const walletView = <><div className="section-title"><div><small>DRIVER WALLET</small><h2>Your earnings</h2></div></div><section className="wallet-card"><Wallet size={30} /><small>AVAILABLE BALANCE</small><strong>₹{earnings}</strong><p>{tripHistory.length === 0 ? 'Complete a ride to add earnings.' : `${tripHistory.length} completed ${tripHistory.length === 1 ? 'trip' : 'trips'} credited to your wallet.`}</p></section><section className="info-card"><strong>Live booking workflow</strong><p>Passenger details shown in Trips are loaded from the Unified Ticketing API.</p></section></>

  return <main className="driver-shell"><header><div className="avatar">{initials}</div><div><small>GOOD EVENING</small><h1>{username}</h1></div><button className={`online ${online ? '' : 'off'}`} onClick={() => void toggleOnline()}><Power size={15} />{online ? 'Online' : 'Offline'}</button></header><section className="map"><div className="map-label"><Navigation size={16} /><span>{activeCluster ? `${activeCluster.origin} Metro Station` : 'Waiting for bookings'}</span></div><span className="pin one" /><span className="pin two" /><span className="route-line" /><div className="map-status"><span className="pulse" /> {online ? 'Listening for passenger clusters' : 'You are offline'}</div></section><section className="content"><div className="earnings"><div><small>TODAY’S EARNINGS</small><strong>₹{earnings}</strong><p>{tripHistory.length === 0 ? 'Complete a ride to start earning' : `${tripHistory.length} completed ${tripHistory.length === 1 ? 'trip' : 'trips'} today`}</p></div><Wallet size={25} /></div>{apiError && <p className="driver-error">{apiError}</p>}{activeView === 'trips' ? tripsView : activeView === 'history' ? historyView : walletView}</section><nav><button className={activeView === 'trips' ? 'active' : ''} onClick={() => setActiveView('trips')}><MapPin size={19} /><span>Trips</span></button><button className={activeView === 'history' ? 'active' : ''} onClick={() => setActiveView('history')}><Clock3 size={19} /><span>History</span></button><button className={activeView === 'wallet' ? 'active' : ''} onClick={() => setActiveView('wallet')}><Wallet size={19} /><span>Wallet</span></button></nav></main>
}
