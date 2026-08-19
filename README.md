# Kochi Metro Unified Ticketing

Kochi Metro Unified Ticketing is a smart metro and last-mile journey platform. It uses destination-aware passenger grouping, nearest-station mapping, and pickup-zone assignment to bring ticket booking, shared feeder transport, guidance, and driver operations into one connected experience. This repository contains independent passenger and driver React portals plus a Flask REST API, deployed in production on AWS EC2.

> **Codex Nightline prototype:** This project was built as a solo prototype for **Codex Nightline**, the AI build sprint hosted with Kochi Metro Rail Limited at Vyttila Metro Station. It was selected among the **Top 10 finalists out of 100 curated builders**.
>

> **Competition snapshot:** The `product-made-in-competition` branch preserves the original prototype created during the two-hour sprint. No further updates are made to that branch; ongoing development happens on `main`.
>
> **Service availability:** The AWS backend exists for this prototype demonstration and may be stopped after the hackathon.

> **Prototype notice:** All stations, final destinations, pickup zones, routes, fares, vehicle details, and driver data shown in this application are representative demo data for prototyping. They may differ from real-world KMRL operations and should be validated against official operational data before production use.

## Applications

- `passenger-portal` — traveller booking experience
- `driver-portal` — driver operations experience
- `backend` — API, SQLite persistence, and clustering engine

## Live portals

- [Passenger Booking Portal](https://kochi-metro-booking.vercel.app/) — live ticket and unified journey booking experience
- [Driver Portal](https://driverportal-rho.vercel.app/) — live driver cluster, trip, and earnings experience



## What Unified Ticketing solves

Metro adoption often breaks at the first and last mile: passengers do not know how to reliably reach a station or complete the trip after exiting one. This creates dependence on private vehicles and fragmented, untracked payments. Unified Ticketing creates a single passenger journey from station entry through shared feeder transport to the final destination.

The product focuses on:

- reducing uncertainty around the last-mile handoff with station, zone, and driver guidance
- grouping riders travelling toward nearby final destinations to make shared travel practical
- giving drivers ready-made passenger clusters instead of individual, inefficient trips
- providing a unified journey experience instead of disconnected metro and cab bookings
- creating a premium, hassle-free passenger experience with one booking, one payment, and guided handoffs
- keeping travel budget-friendly by sharing the last-mile ride among passengers heading toward compatible destinations

## Revenue leakage prevention

- Each passenger journey is created through the Flask API and stored with a booking status, fare, origin, final destination, assigned zone, and timestamp.
- Unified Booking keeps the metro and last-mile fare in one tracked record instead of relying on informal, unrecorded feeder payments.
- Driver acceptance is API-backed: a cluster can be claimed only by an online driver, which creates a clear assignment trail.
- Driver wallet and earnings data supports reconciliation of completed feeder trips.
- The API’s admin overview exposes booking, open-cluster, and driver-availability counts for operational monitoring.
- QR-ticket and gate guidance give the prototype a clear place to connect ticket validation and payment reconciliation in a production KMRL integration.

## Proposed KMRL revenue model

- KMRL receives a proposed **15% commission** on each last-mile trip completed by a partner driver through the Driver Portal.
- For a KMRL-operated feeder bus, KMRL retains **100% of the applicable feeder fare** through the unified payment flow.
- The model turns fragmented informal last-mile payments into a measurable KMRL revenue channel while keeping shared rides more affordable for passengers.

## Features

### Passenger Booking Portal

- Prototype sign-in with any username and demo password `123` (with persistent prototype disclaimer banner)
- Station-only start selection and final-destination dropdown choices with dynamic route-based fare calculation
- Standard metro ticket and recommended Unified Booking choices with real-time driver availability check
- **Driver Availability & Graceful Fallback:** If zero feeder drivers are currently online in the zone, riders are immediately notified with a contextual alert and guided to continue with a Standard Metro ticket
- Unified metro, shared last-mile, and single-payment journey summary
- Destination-aware smart grouping with nearest-station and pickup-zone assignment
- Guided rider flow: booking, station boarding confirmation, metro journey, arrival-zone handoff, cab/feeder confirmation, and final-destination completion
- Live driver-assignment status and in-app travel-partner help action

### Driver Portal

- Online/offline availability controls that synchronize in real-time with the backend dispatch engine
- Nearby grouped-passenger cluster card with route, rider count, fare, and ETA
- Multi-tier vehicle support: dynamically displays assigned Cab (1–5 riders) or Feeder Bus (10–20 riders)
- Sequential trip queue: handles single-driver multi-passenger queues seamlessly
- Accept, start, and complete trip workflow
- Earnings, wallet, navigation, and trip-history entry points

### Backend API and smart grouping

- Flask REST API with Flask-CORS and SQLite storage designed for a future PostgreSQL replacement
- **Dynamic Fare Engine:** Calculates approx metro fares based on station hops and last-mile feeder charges based on destination distance
- **Smart Grouping & Fleet Allocation:**
  - Grouping passengers sharing the same destination zone and handoff station
  - 1 to 5 passengers: Grouped into a single 5-seater cab
  - 6 to 9 passengers: Split across two 5-seater cabs (e.g. 5 in one cab, remainder in another)
  - 10 to 20 passengers: Consolidated into a high-capacity Metro Feeder Bus
- Passenger booking, station lookup, journey quotes, driver availability tracking (`/api/drivers/status`), cluster acceptance, and admin overview endpoints
- Destination-aware nearest-station mapping and pickup-zone assignment for grouped last-mile riders
- Gunicorn, Nginx, and systemd production configuration for Ubuntu EC2

## Deployment

- Passenger and Driver applications are independently deployed to Vercel.
- Flask API is deployed on AWS EC2 and served through Nginx.
- The deployed API is secured with HTTPS, Gunicorn workers, systemd restart management, and Nginx reverse proxying on AWS EC2.


## Local development

Install the frontend dependencies in each portal, then run `npm run dev`. For the API, create a Python virtual environment, install `backend/requirements.txt`, and run `flask --app app run --debug` from `backend`.

## Prototype sign-in

Use any username with password `123` in the Passenger Portal prototype.
