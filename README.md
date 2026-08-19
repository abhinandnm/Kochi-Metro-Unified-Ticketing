# Kochi Metro Unified Ticketing

Kochi Metro Unified Ticketing is a smart metro and capacity-aware last-mile mobility platform. It integrates destination-aware passenger grouping, nearest-station mapping, dynamic pickup-zone assignment, safety verification, and driver operations into one connected experience. The platform consists of independent passenger and driver React portals plus a Flask REST API with SQLite/PostgreSQL persistence.

> **Codex Nightline prototype:** Built for **Codex Nightline**, the AI build sprint hosted with Kochi Metro Rail Limited at Vyttila Metro Station, and selected among the **Top 10 finalists out of 100 curated builders**.
>
> **Competition snapshot:** The `product-made-in-competition` branch preserves the original prototype created during the sprint. Ongoing production-grade improvements happen on `main`.
>
> **Prototype notice:** Stations, destinations, pickup zones, routes, fares, vehicle details, and driver data shown in this application are representative prototype data.

---

## Applications

- `passenger-portal` — Passenger booking, QR digital pass, live trip tracking, and SOS emergency experience.
- `driver-portal` — Driver availability, smart cluster assignment, passenger OTP verification, zone navigation, and earnings wallet.
- `backend` — Flask REST API, HMAC token authentication, RBAC, non-destructive clustering engine, dynamic fare engine, and SOS dispatcher.

---

## Live Portals

- [Passenger Booking Portal](https://kochi-metro-booking.vercel.app/) — Live unified ticket booking experience.
- [Driver Portal](https://driverportal-rho.vercel.app/) — Live driver cluster assignment, trip lifecycle, and earnings.

---

## Core Capabilities & Architecture

```
                    ┌───────────────────────────────┐
                    │      Client Applications      │
                    └───────────────┬───────────────┘
                                    │
             ┌──────────────────────┴──────────────────────┐
             ▼                                             ▼
┌─────────────────────────┐                   ┌─────────────────────────┐
│    Passenger Portal     │                   │      Driver Portal      │
│ (React/Vite - Polling)  │                   │ (React/Vite - Polling)  │
└────────────┬────────────┘                   └────────────┬────────────┘
             │                                             │
             │ Authorization: Bearer <HMAC-SHA256 Token>   │
             └──────────────────────┬──────────────────────┘
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                          Flask REST Backend                           │
│ ┌─────────────────────────┬─────────────────────────┬───────────────┐ │
│ │  Dynamic Fare Engine    │ Dynamic Pickup Zones    │ Cluster Engine│ │
│ ├─────────────────────────┼─────────────────────────┼───────────────┤ │
│ │  RBAC & Token Security  │ Trip Lifecycle & OTP    │ SOS Dispatcher│ │
│ └─────────────────────────┴─────────────────────────┴───────────────┘ │
└───────────────────────────────────┬───────────────────────────────────┘
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        SQLite Database (orbit)                        │
│   [drivers]  ──(1:N)──  [clusters]  ──(1:N)──  [bookings]             │
│   [sos_alerts]          [idempotency_keys]                            │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Features

### 1. Passenger Booking Portal
- **Role-Based Authentication:** Secure token-based session login (demo password `123`).
- **Flexible Journey Modes:**
  - **Standard Metro Ticket:** Direct origin-to-destination train leg.
  - **Unified Last-Mile Coordination:** Metro train leg + capacity-matched shared feeder cab/bus.
- **Dynamic Exit-Station Resolution:** Automatically maps destination keywords to optimal exit hubs (e.g., *Infopark/SmartCity $\rightarrow$ Vyttila*, *Lulu Mall $\rightarrow$ Edappally*, *Fort Kochi $\rightarrow$ MG Road*).
- **Interactive Tiered Fare Breakdown:**
  - Live cost transparency: **Metro Leg** + **Last-Mile Base** + **Distance Charge** minus **15% Shared Cluster Discount**.
  - Commercial distribution model (75% driver share, 15% KMRL component, 10% operations).
- **Driver Availability & Graceful Fallback:** Real-time seat capacity check with 4 actionable alternatives if vehicles are offline.
- **Idempotency & Duplicate Protection:** Server-side request deduplication (`Idempotency-Key`) preventing accidental double bookings.
- **Safety OTP Pass:** Cryptographically random 4-digit safety code generated for driver verification.
- **Live Trip Lifecycle Tracker:** Tracks backend stages (`driver_assigned` $\rightarrow$ `arriving` $\rightarrow$ `arrived` $\rightarrow$ `in_transit` $\rightarrow$ `completed`).
- **Emergency SOS Dispatcher:** Real-time emergency trigger sending browser GPS coordinates and trip details to backend `sos_alerts`.
- **Live Trip Sharing:** Shareable emergency tracking link for family contacts.

### 2. Driver Partner Operations Portal
- **Driver Availability & Vehicle Selector:** Toggle `AVAILABLE`, `BUSY`, or `OFFLINE` status; select active vehicle type (**Sedan EV 4-seat**, **SUV 6-seat**, or **Feeder Bus 20-seat**).
- **Vehicle-Class Cluster Filtering:** Drivers only receive clusters matching their vehicle type and capacity (sedan drivers never see feeder buses).
- **Cluster Intelligence Card:** Route, grouped rider count, ETA, dynamic bay, detour buffer (+min), and match score (0–100%).
- **Turn-by-Turn Navigation:** Direct integration with Google Maps to the assigned station pickup bay.
- **Trip Lifecycle Controls:**
  - `Accept Cluster` $\rightarrow$ `Signal En Route (arriving)` $\rightarrow$ `Signal Arrived at Bay (arrived)` $\rightarrow$ `Verify Passenger OTP & Start` $\rightarrow$ `Complete & Settle`.
- **Driver Wallet & History:** Instant 75% last-mile fare credit to wallet upon completion, with chronological ride logs.

### 3. Backend Engine & Routing Intelligence
- **Corridor Smart Grouping:** Groups passengers heading along identical urban transit corridors.
- **Hard Constraint Enforcement:**
  - `MAX_WAIT_TIME = 10 min`: Groups exceeding 10 min wait are split into smaller approved clusters.
  - `MAX_DETOUR = 15 min`: Detour deviations strictly enforced before cluster creation.
  - `ZONE_CAPACITY = 2`: Dynamically balances station pickup bays across Zones A, B, C, and D.
- **Demand-Responsive Feeder Bus Allocation:** Automatically consolidates corridor demand into a 20-passenger Feeder Bus when unassigned riders reach $\ge 10$.
- **Non-Destructive Clustering:** In-flight driver cluster claims are preserved when new passenger bookings arrive.

### 4. Security & Access Control (RBAC)
- **Token Security:** Stateless HMAC-SHA256 bearer tokens.
- **IDOR Protection:** Passengers can access only their own bookings; cross-account access is rejected (`403 Forbidden`).
- **OTP Privacy:** Universal backdoor (`4721`) removed; passenger secret OTPs are masked from cluster feeds.
- **Client Forgery Protection:** Fares, payouts, passenger identities, and driver IDs are computed strictly server-side.

---

## API Reference Summary

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Authenticates passenger, driver, or admin (password: `123`). |
| `GET` | `/api/stations` | Public | Returns list of metro stations and dynamic pickup zones. |
| `POST` | `/api/journeys/quote` | Public | Calculates tiered dynamic fare quote and driver availability. |
| `POST` | `/api/bookings` | Passenger | Idempotent booking creation with OTP and dynamic zone assignment. |
| `GET` | `/api/bookings/:id` | Owner / Admin | Secure booking status and driver details (IDOR protected). |
| `POST` | `/api/bookings/:id/cancel`| Owner / Admin | Cancels booking and recalculates cluster fare. |
| `GET` | `/api/clusters` | Driver / Admin | Returns filtered clusters matching driver vehicle capacity. |
| `POST` | `/api/clusters/:id/accept` | Driver | Atomically claims open cluster for the authenticated driver. |
| `POST` | `/api/clusters/:id/arriving`| Driver | Signals vehicle is en route to pickup bay. |
| `POST` | `/api/clusters/:id/arrived` | Driver | Signals vehicle has arrived at pickup bay. |
| `POST` | `/api/clusters/:id/start-trip`| Driver | Verifies passenger OTP and transitions trip to `in_transit`. |
| `POST` | `/api/clusters/:id/complete`| Driver / Admin | Completes trip, settles fare, and credits driver wallet. |
| `POST` | `/api/clusters/:id/cancel-driver` | Driver / Admin | Cancels driver assignment and resets cluster to open search. |
| `POST` | `/api/sos` | Passenger | Dispatches emergency SOS alert with GPS telemetry. |
| `GET` | `/api/admin/metrics` | Admin | Returns operational analytics and commercial revenue splits. |

---

## Local Development

### Backend
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
python test_api.py   # Run integration tests
flask --app app run --port 8000 --debug
```

### Passenger Portal
```bash
cd passenger-portal
npm install
npm run dev
```

### Driver Portal
```bash
cd driver-portal
npm install
npm run dev
```

---

## Prototype Sign-In

- **Passenger Portal:** Any passenger name with demo password `123`.
- **Driver Portal:** Driver name (e.g. `Rakesh Kumar`, `Anil Varma`) with demo password `123`.
- **Admin Endpoints:** Admin token with password `123` or `kmrladmin123`.
