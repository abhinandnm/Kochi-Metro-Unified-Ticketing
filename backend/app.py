import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from database import connect, initialize

load_dotenv()
STATIONS = ['Aluva', 'Edappally', 'Kaloor', 'MG Road', 'Maharaja’s College', 'Vyttila', 'Pettta']
DESTINATION_ZONES = {'Aluva': 'North gate · Zone A', 'Edappally': 'Metro feeder bay · Zone C', 'Kaloor': 'South gate · Zone B', 'MG Road': 'South gate · Zone B', 'Maharaja’s College': 'South gate · Zone B', 'Vyttila': 'Metro feeder bay · Zone C', 'Pettta': 'North gate · Zone A'}
CAB_CAPACITY = 5
FEEDER_BUS_CAPACITY = 20
FEEDER_BUS_MINIMUM = 10

def row(data): return dict(data) if data else None

def nearest_station(final_destination):
    mapping = {'kakkanad': 'Vyttila', 'infopark': 'Vyttila', 'fort kochi': 'MG Road', 'marine drive': 'MG Road', 'edappally': 'Edappally', 'aluva': 'Aluva', 'tripunithura': 'Pettta'}
    return next((station for key, station in mapping.items() if key in final_destination.lower()), 'Maharaja’s College')

def station_name(value):
    return str(value or '').replace(' Metro Station', '').strip()

def last_mile_km(final_destination):
    destination = final_destination.lower()
    distances = {'lulu': 2.5, 'mobility hub': 1.5, 'mg road': 1.0, 'marine drive': 2.0, 'fort kochi': 6.5, 'infopark': 7.5, 'smartcity': 8.5, 'tripunithura': 3.0}
    return next((distance for key, distance in distances.items() if key in destination), 4.0)

def journey_quote(origin, final_destination, journey_type):
    origin = station_name(origin)
    handoff_station = nearest_station(final_destination)
    metro_stops = abs(STATIONS.index(origin) - STATIONS.index(handoff_station))
    metro_fare = min(42, 12 + metro_stops * 5)
    if journey_type != 'orbit':
        return {'fare': metro_fare, 'metro_fare': metro_fare, 'last_mile_fare': 0, 'estimated_minutes': 12 + metro_stops * 4, 'handoff_station': handoff_station}
    km = last_mile_km(final_destination)
    last_mile_fare = 18 + round(km * 5)
    return {'fare': metro_fare + last_mile_fare, 'metro_fare': metro_fare, 'last_mile_fare': last_mile_fare, 'estimated_minutes': 18 + metro_stops * 4 + round(km * 2), 'handoff_station': handoff_station}

def rebuild_open_clusters(db):
    """Rebuild waiting Orbit bookings into shared-route vehicle loads."""
    db.execute('UPDATE bookings SET cluster_id=NULL, status="confirmed" WHERE cluster_id IN (SELECT id FROM clusters WHERE status="open")')
    db.execute('DELETE FROM clusters WHERE status="open"')
    bookings = db.execute('SELECT * FROM bookings WHERE journey_type="orbit" AND cluster_id IS NULL ORDER BY created_at, id').fetchall()
    groups = {}
    for booking in bookings:
        groups.setdefault((booking['nearest_station'], booking['destination'], booking['pickup_zone']), []).append(booking)
    for (handoff_station, destination, pickup_zone), riders in groups.items():
        vehicle_type = 'feeder_bus' if len(riders) >= FEEDER_BUS_MINIMUM else 'cab'
        capacity = FEEDER_BUS_CAPACITY if vehicle_type == 'feeder_bus' else CAB_CAPACITY
        for offset in range(0, len(riders), capacity):
            group = riders[offset:offset + capacity]
            # A bus remainder below the viable load becomes a cab cluster.
            if vehicle_type == 'feeder_bus' and len(group) < FEEDER_BUS_MINIMUM:
                capacity, cluster_type = CAB_CAPACITY, 'cab'
                chunks = [group[index:index + capacity] for index in range(0, len(group), capacity)]
            else:
                cluster_type, chunks = vehicle_type, [group]
            for chunk in chunks:
                fare = sum(journey_quote(item['origin'], item['destination'], 'orbit')['last_mile_fare'] for item in chunk)
                cursor = db.execute('INSERT INTO clusters(origin,destination,pickup_zone,passenger_count,estimated_minutes,fare,vehicle_type,vehicle_capacity) VALUES(?,?,?,?,?,?,?,?)', (handoff_station, destination, pickup_zone, len(chunk), 10 + len(chunk) * 2, fare, cluster_type, FEEDER_BUS_CAPACITY if cluster_type == 'feeder_bus' else CAB_CAPACITY))
                db.executemany('UPDATE bookings SET cluster_id=?, status="clustered" WHERE id=?', [(cursor.lastrowid, item['id']) for item in chunk])

def cluster_payload(db, cluster):
    payload = row(cluster)
    payload['passengers'] = [row(item) for item in db.execute('SELECT id, passenger_name, destination, status FROM bookings WHERE cluster_id=? ORDER BY id', (cluster['id'],))]
    return payload

def get_or_create_driver(db, name):
    driver = db.execute('SELECT * FROM drivers WHERE lower(name)=lower(?)', (name,)).fetchone()
    if driver:
        db.execute('UPDATE drivers SET online=1 WHERE id=?', (driver['id'],))
        return db.execute('SELECT * FROM drivers WHERE id=?', (driver['id'],)).fetchone()
    cursor = db.execute('INSERT INTO drivers(name,vehicle,online,wallet) VALUES(?,?,?,?)', (name, 'Kochi Metro feeder', 1, 0))
    return db.execute('SELECT * FROM drivers WHERE id=?', (cursor.lastrowid,)).fetchone()

def create_app():
    app = Flask(__name__)
    CORS(app, resources={r'/*': {'origins': '*'}})
    initialize()

    @app.get('/')
    def index(): return jsonify(service='kmrl-unified-ticketing-api', status='ok', health='/api/health')

    @app.get('/api/health')
    def health(): return jsonify(status='ok', service='kmrl-unified-ticketing-api', database='ready')

    @app.get('/api/stations')
    def stations(): return jsonify(stations=STATIONS)

    @app.post('/api/journeys/quote')
    def quote():
        data = request.get_json(silent=True) or {}
        origin = station_name(data.get('origin'))
        if origin not in STATIONS or not str(data.get('destination', '')).strip():
            return jsonify(error='Select a valid origin station and final destination.'), 400
        orbit = data.get('journey_type') == 'orbit'
        quote = journey_quote(origin, str(data['destination']), 'orbit' if orbit else 'standard')
        return jsonify(origin=origin, destination=data['destination'], journey_type='orbit' if orbit else 'standard', pickup_zone=DESTINATION_ZONES[quote['handoff_station']] if orbit else None, **quote)

    @app.post('/api/bookings')
    def book():
        data = request.get_json(silent=True) or {}
        required = ('passenger_name', 'origin', 'destination', 'journey_type')
        if any(not str(data.get(key, '')).strip() for key in required): return jsonify(error='Missing booking details.'), 400
        origin = station_name(data['origin'])
        if origin not in STATIONS: return jsonify(error='Select a valid origin station.'), 400
        orbit = data['journey_type'] == 'orbit'
        quote = journey_quote(origin, data['destination'], 'orbit' if orbit else 'standard')
        station = quote['handoff_station']
        pickup_zone = DESTINATION_ZONES[station] if orbit else None
        with connect() as db:
            cursor = db.execute('INSERT INTO bookings(passenger_name,origin,destination,nearest_station,journey_type,pickup_zone,fare,status) VALUES(?,?,?,?,?,?,?,?)', (data['passenger_name'].strip(), origin, data['destination'].strip(), station, 'orbit' if orbit else 'standard', pickup_zone, quote['fare'], 'confirmed'))
            booking_id = cursor.lastrowid
            if orbit:
                rebuild_open_clusters(db)
            booking = row(db.execute('SELECT * FROM bookings WHERE id=?', (booking_id,)).fetchone())
        return jsonify(booking=booking), 201

    @app.get('/api/bookings/<int:booking_id>')
    def booking_status(booking_id):
        with connect() as db:
            booking = db.execute('SELECT b.*, c.status AS cluster_status, c.passenger_count AS cluster_passenger_count, c.pickup_zone AS assigned_zone, c.vehicle_type, d.name AS driver_name, d.vehicle AS driver_vehicle FROM bookings b LEFT JOIN clusters c ON b.cluster_id=c.id LEFT JOIN drivers d ON c.driver_id=d.id WHERE b.id=?', (booking_id,)).fetchone()
            if not booking: return jsonify(error='Booking not found.'), 404
            return jsonify(booking=row(booking))

    @app.get('/api/clusters')
    def clusters():
        with connect() as db:
            records = [cluster_payload(db, item) for item in db.execute('SELECT c.*, d.name AS driver_name, d.vehicle AS driver_vehicle FROM clusters c LEFT JOIN drivers d ON c.driver_id=d.id WHERE c.status IN ("open","accepted") ORDER BY c.id DESC')]
        return jsonify(clusters=records)

    @app.post('/api/clusters/<int:cluster_id>/accept')
    def accept(cluster_id):
        name = str((request.get_json(silent=True) or {}).get('driver_name', '')).strip()
        if not name: return jsonify(error='Driver name is required.'), 400
        with connect() as db:
            cluster = db.execute('SELECT * FROM clusters WHERE id=? AND status="open"', (cluster_id,)).fetchone()
            if not cluster: return jsonify(error='Cluster is no longer available.'), 409
            driver = get_or_create_driver(db, name)
            db.execute('UPDATE clusters SET status="accepted", driver_id=? WHERE id=?', (driver['id'], cluster_id))
            db.execute('UPDATE bookings SET status="driver_assigned" WHERE cluster_id=?', (cluster_id,))
            accepted = db.execute('SELECT c.*, d.name AS driver_name, d.vehicle AS driver_vehicle FROM clusters c JOIN drivers d ON c.driver_id=d.id WHERE c.id=?', (cluster_id,)).fetchone()
            return jsonify(cluster=cluster_payload(db, accepted))

    @app.post('/api/clusters/<int:cluster_id>/complete')
    def complete(cluster_id):
        with connect() as db:
            cluster = db.execute('SELECT * FROM clusters WHERE id=? AND status="accepted"', (cluster_id,)).fetchone()
            if not cluster: return jsonify(error='Accepted cluster not found.'), 409
            db.execute('UPDATE clusters SET status="completed" WHERE id=?', (cluster_id,))
            db.execute('UPDATE bookings SET status="completed" WHERE cluster_id=?', (cluster_id,))
            db.execute('UPDATE drivers SET wallet=wallet+? WHERE id=?', (cluster['fare'], cluster['driver_id']))
            return jsonify(completed=True, earnings=cluster['fare'])

    @app.get('/api/admin/overview')
    def overview():
        with connect() as db:
            return jsonify(bookings=db.execute('SELECT COUNT(*) FROM bookings').fetchone()[0], open_clusters=db.execute('SELECT COUNT(*) FROM clusters WHERE status="open"').fetchone()[0], online_drivers=db.execute('SELECT COUNT(*) FROM drivers WHERE online=1').fetchone()[0])
    return app

app = create_app()
if __name__ == '__main__': app.run(host='0.0.0.0', port=int(os.getenv('PORT', '8000')), debug=os.getenv('FLASK_ENV') == 'development')
