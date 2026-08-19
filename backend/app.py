import os
import random
import time
import json
import hmac
import hashlib
import base64
from functools import wraps
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from database import connect, initialize
from clustering import (
    evaluate_cluster_compatibility,
    get_destination_km,
    get_corridor,
    MAX_WAIT_TIME,
    MAX_DETOUR
)

load_dotenv()

STATIONS = ['Aluva', 'Edappally', 'Kaloor', 'MG Road', 'Maharaja’s College', 'Vyttila', 'Pettta']
STATION_ZONES = ['Zone A (North Gate)', 'Zone B (South Gate)', 'Zone C (Metro Feeder Bay)', 'Zone D (East Exit)']
CAB_CAPACITY = 4
FEEDER_BUS_CAPACITY = 20
FEEDER_BUS_MINIMUM = 10
ZONE_CAPACITY = 2  # Max 2 vehicles per zone simultaneously
SECRET_KEY = os.getenv('SECRET_KEY', 'kmrl-unified-secret-key-2026')

def row(data):
    return dict(data) if data else None

def create_token(payload):
    payload_data = payload.copy()
    payload_data['iat'] = int(time.time())
    payload_data['exp'] = int(time.time()) + 86400 * 7  # 7 days
    raw_json = json.dumps(payload_data, separators=(',', ':'), sort_keys=True).encode('utf-8')
    b64_payload = base64.urlsafe_b64encode(raw_json).decode('utf-8').rstrip('=')
    signature = hmac.new(SECRET_KEY.encode('utf-8'), b64_payload.encode('utf-8'), hashlib.sha256).hexdigest()
    return f"{b64_payload}.{signature}"

def verify_token(token_str):
    if not token_str or '.' not in token_str:
        return None
    try:
        b64_payload, signature = token_str.split('.', 1)
        expected_sig = hmac.new(SECRET_KEY.encode('utf-8'), b64_payload.encode('utf-8'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None
        padded = b64_payload + '=' * ((4 - len(b64_payload) % 4) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode('utf-8')).decode('utf-8'))
        if data.get('exp', 0) < time.time():
            return None
        return data
    except Exception:
        return None

def get_auth_user():
    auth_header = request.headers.get('Authorization', '')
    token = ''
    if auth_header.startswith('Bearer '):
        token = auth_header[7:].strip()
    elif 'X-Auth-Token' in request.headers:
        token = request.headers.get('X-Auth-Token', '').strip()
    if not token:
        return None
    return verify_token(token)

def require_auth(roles=None):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user = get_auth_user()
            if not user:
                return jsonify(error='Authentication required.', code='UNAUTHENTICATED'), 401
            if roles and user.get('role') not in roles and user.get('role') != 'admin':
                return jsonify(error='Forbidden: Insufficient privileges.', code='FORBIDDEN'), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator

def nearest_station(final_destination):
    mapping = {
        'kakkanad': 'Vyttila',
        'infopark': 'Vyttila',
        'smartcity': 'Vyttila',
        'mobility hub': 'Vyttila',
        'fort kochi': 'MG Road',
        'marine drive': 'MG Road',
        'edappally': 'Edappally',
        'lulu': 'Edappally',
        'aluva': 'Aluva',
        'tripunithura': 'Pettta'
    }
    return next((station for key, station in mapping.items() if key in str(final_destination or '').lower()), 'Maharaja’s College')

def station_name(value):
    return str(value or '').replace(' Metro Station', '').strip()

def calculate_fare_engine(origin, final_destination, journey_type='orbit'):
    """
    Dynamic Tiered Fare Calculation Engine:
    Base fare + Distance charge + Time charge - Shared discount.
    Includes illustrative commercial model split.
    """
    origin_clean = station_name(origin)
    handoff_station = nearest_station(final_destination)
    metro_stops = abs(STATIONS.index(origin_clean) - STATIONS.index(handoff_station)) if origin_clean in STATIONS and handoff_station in STATIONS else 2
    metro_fare = min(40, 10 + metro_stops * 6)
    
    if journey_type != 'orbit':
        return {
            'fare': metro_fare,
            'metro_fare': metro_fare,
            'last_mile_fare': 0,
            'distance_km': 0,
            'estimated_minutes': 10 + metro_stops * 4,
            'handoff_station': handoff_station,
            'breakdown': {
                'metro_fare': metro_fare,
                'last_mile_fare': 0,
                'base_fare': 0,
                'distance_charge': 0,
                'shared_discount': 0
            },
            'commercial_split': {
                'driver_payout': 0,
                'kmrl_share': metro_fare,
                'platform_ops': 0
            }
        }
    
    km = get_destination_km(final_destination)
    base_fare = 25
    distance_charge = round(km * 8)
    shared_discount = round((base_fare + distance_charge) * 0.15)
    last_mile_fare = max(35, (base_fare + distance_charge - shared_discount))
    total_fare = metro_fare + last_mile_fare
    
    # Illustrative split
    driver_payout = round(last_mile_fare * 0.75)
    kmrl_share = metro_fare + round(last_mile_fare * 0.15)
    platform_ops = total_fare - driver_payout - kmrl_share
    
    return {
        'fare': total_fare,
        'metro_fare': metro_fare,
        'last_mile_fare': last_mile_fare,
        'distance_km': km,
        'estimated_minutes': 14 + metro_stops * 4 + round(km * 2),
        'handoff_station': handoff_station,
        'corridor': get_corridor(handoff_station, final_destination),
        'breakdown': {
            'metro_fare': metro_fare,
            'last_mile_fare': last_mile_fare,
            'base_fare': base_fare,
            'distance_charge': distance_charge,
            'shared_discount': shared_discount
        },
        'commercial_split': {
            'driver_payout': driver_payout,
            'kmrl_share': kmrl_share,
            'platform_ops': platform_ops
        }
    }

def get_available_capacity(db):
    """Calculates total available seats across all online and available drivers."""
    cursor = db.execute("SELECT SUM(capacity) FROM drivers WHERE online = 1 AND status = 'AVAILABLE'")
    res = cursor.fetchone()[0]
    return res if res is not None else 0

def assign_dynamic_pickup_zone(db, station):
    """
    Dynamic Pickup-Zone Management:
    Checks current occupied vehicles per zone at the station.
    Respects ZONE_CAPACITY limit (2 vehicles per zone).
    """
    zone_counts = {zone: 0 for zone in STATION_ZONES}
    rows = db.execute(
        '''SELECT pickup_zone, COUNT(*) as count FROM clusters 
           WHERE origin = ? AND status IN ("open", "accepted", "in_transit", "arriving", "arrived") 
           GROUP BY pickup_zone''',
        (station,)
    ).fetchall()
    
    for r in rows:
        if r['pickup_zone'] in zone_counts:
            zone_counts[r['pickup_zone']] = r['count']
    
    available_zones = {z: c for z, c in zone_counts.items() if c < ZONE_CAPACITY}
    if available_zones:
        return min(available_zones, key=available_zones.get)
    
    # If all zones at capacity, pick least congested
    return min(zone_counts, key=zone_counts.get)

def rebuild_open_clusters(db):
    """
    Non-destructive smart grouping for Orbit bookings.
    Preserves active/open clusters so in-flight driver acceptance is never disrupted.
    Dynamically promotes to feeder bus when demand accumulates on a corridor (>=10 riders).
    """
    unclustered = db.execute(
        'SELECT * FROM bookings WHERE journey_type="orbit" AND cluster_id IS NULL AND status = "confirmed" ORDER BY created_at, id'
    ).fetchall()
    
    if not unclustered:
        return
    
    grouped = {}
    for b in unclustered:
        station = b['nearest_station'] or nearest_station(b['destination'])
        corridor = get_corridor(station, b['destination'])
        grouped.setdefault((station, corridor), []).append(b)
    
    for (handoff_station, corridor), new_riders in grouped.items():
        # Find all open, unassigned clusters on this station
        open_clusters = db.execute(
            'SELECT * FROM clusters WHERE origin=? AND status="open" AND driver_id IS NULL ORDER BY id',
            (handoff_station,)
        ).fetchall()
        
        # Identify open clusters belonging to this exact corridor
        corridor_clusters = []
        corridor_existing_riders = []
        for oc in open_clusters:
            b_list = db.execute(
                'SELECT * FROM bookings WHERE cluster_id=? AND status != "cancelled"',
                (oc['id'],)
            ).fetchall()
            if b_list:
                # Check if corridor matches
                c_corridor = get_corridor(handoff_station, b_list[0]['destination'])
                if c_corridor == corridor:
                    corridor_clusters.append(oc)
                    corridor_existing_riders.extend(b_list)
        
        total_corridor_riders = corridor_existing_riders + new_riders
        
        # Check if total unassigned demand on this corridor reaches feeder bus threshold
        if len(total_corridor_riders) >= FEEDER_BUS_MINIMUM:
            # Consolidate into Feeder Bus (capacity 20)
            bus_group = total_corridor_riders[:FEEDER_BUS_CAPACITY]
            score, detour, wait, compatibility, approved = evaluate_cluster_compatibility(
                handoff_station, bus_group, is_feeder_bus=True
            )
            destinations = list({item['destination'] for item in bus_group})
            dest_title = destinations[0] if len(destinations) == 1 else f"{destinations[0]} + {len(destinations)-1} stops ({corridor})"
            total_fare = sum(calculate_fare_engine(item['origin'], item['destination'], 'orbit')['last_mile_fare'] for item in bus_group)
            est_minutes = 10 + len(bus_group) + detour
            
            if corridor_clusters:
                primary_cluster = corridor_clusters[0]
                cluster_id = primary_cluster['id']
                pickup_zone = primary_cluster['pickup_zone']
                db.execute(
                    '''UPDATE clusters SET passenger_count=?, fare=?, destination=?, vehicle_type='feeder_bus', 
                       vehicle_capacity=?, score=?, detour_minutes=?, wait_minutes=?, compatibility=? WHERE id=?''',
                    (len(bus_group), total_fare, dest_title, FEEDER_BUS_CAPACITY, score, detour, wait, compatibility, cluster_id)
                )
                # Delete redundant extra open clusters on this corridor
                for extra in corridor_clusters[1:]:
                    db.execute('DELETE FROM clusters WHERE id=?', (extra['id'],))
            else:
                pickup_zone = assign_dynamic_pickup_zone(db, handoff_station)
                cursor = db.execute(
                    '''INSERT INTO clusters(
                        origin, destination, pickup_zone, passenger_count, estimated_minutes, 
                        fare, vehicle_type, vehicle_capacity, status, score, detour_minutes, 
                        wait_minutes, compatibility
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                    (
                        handoff_station, dest_title, pickup_zone, len(bus_group), est_minutes,
                        total_fare, 'feeder_bus', FEEDER_BUS_CAPACITY, 'open', score, detour, wait, compatibility
                    )
                )
                cluster_id = cursor.lastrowid
            
            db.executemany(
                'UPDATE bookings SET cluster_id=?, pickup_zone=?, status="clustered" WHERE id=?',
                [(cluster_id, pickup_zone, item['id']) for item in bus_group]
            )
            continue
        
        # Standard Cab allocation (chunk size 4)
        remaining_riders = list(new_riders)
        for o_cluster in corridor_clusters:
            if not remaining_riders:
                break
            cluster_bookings = db.execute(
                'SELECT * FROM bookings WHERE cluster_id=? AND status != "cancelled"',
                (o_cluster['id'],)
            ).fetchall()
            
            space = o_cluster['vehicle_capacity'] - len(cluster_bookings)
            if space > 0:
                candidates = list(cluster_bookings) + remaining_riders[:space]
                score, detour, wait, compatibility, approved = evaluate_cluster_compatibility(
                    handoff_station, candidates, o_cluster['vehicle_type'] == 'feeder_bus'
                )
                if approved:
                    to_add = remaining_riders[:space]
                    remaining_riders = remaining_riders[space:]
                    new_count = len(candidates)
                    new_fare = sum(calculate_fare_engine(item['origin'], item['destination'], 'orbit')['last_mile_fare'] for item in candidates)
                    destinations = list({item['destination'] for item in candidates})
                    dest_title = destinations[0] if len(destinations) == 1 else f"{destinations[0]} + {len(destinations)-1} stops ({corridor})"
                    
                    db.execute(
                        '''UPDATE clusters SET passenger_count=?, fare=?, destination=?, score=?, 
                           detour_minutes=?, wait_minutes=?, compatibility=? WHERE id=?''',
                        (new_count, new_fare, dest_title, score, detour, wait, compatibility, o_cluster['id'])
                    )
                    db.executemany(
                        'UPDATE bookings SET cluster_id=?, pickup_zone=?, status="clustered" WHERE id=?',
                        [(o_cluster['id'], o_cluster['pickup_zone'], b['id']) for b in to_add]
                    )
        
        while remaining_riders:
            chunk_size = min(len(remaining_riders), CAB_CAPACITY)
            best_chunk = None
            for k in range(chunk_size, 0, -1):
                sub_group = remaining_riders[:k]
                score, detour, wait, compatibility, approved = evaluate_cluster_compatibility(
                    handoff_station, sub_group, is_feeder_bus=False
                )
                if approved or k == 1:
                    best_chunk = (sub_group, score, detour, wait, compatibility)
                    break
            
            sub_group, score, detour, wait, compatibility = best_chunk
            remaining_riders = remaining_riders[len(sub_group):]
            
            destinations = list({item['destination'] for item in sub_group})
            dest_title = destinations[0] if len(destinations) == 1 else f"{destinations[0]} + {len(destinations)-1} stops ({corridor})"
            pickup_zone = assign_dynamic_pickup_zone(db, handoff_station)
            total_fare = sum(calculate_fare_engine(item['origin'], item['destination'], 'orbit')['last_mile_fare'] for item in sub_group)
            est_minutes = 10 + len(sub_group) * 2 + detour
            
            cursor = db.execute(
                '''INSERT INTO clusters(
                    origin, destination, pickup_zone, passenger_count, estimated_minutes, 
                    fare, vehicle_type, vehicle_capacity, status, score, detour_minutes, 
                    wait_minutes, compatibility
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                (
                    handoff_station, dest_title, pickup_zone, len(sub_group), est_minutes,
                    total_fare, 'cab', CAB_CAPACITY, 'open', score, detour, wait, compatibility
                )
            )
            cluster_id = cursor.lastrowid
            db.executemany(
                'UPDATE bookings SET cluster_id=?, pickup_zone=?, status="clustered" WHERE id=?',
                [(cluster_id, pickup_zone, item['id']) for item in sub_group]
            )

def cluster_payload(db, cluster, user=None):
    payload = row(cluster)
    if not payload:
        return None
    passengers = [row(item) for item in db.execute('SELECT id, passenger_name, destination, status, otp FROM bookings WHERE cluster_id=? ORDER BY id', (cluster['id'],))]
    
    # Hide sensitive passenger OTP from cluster listing to prevent leakage
    for p in passengers:
        if not user or user.get('role') != 'admin':
            p['otp'] = None
            
    payload['passengers'] = passengers
    return payload

def get_or_create_driver(db, name):
    driver = db.execute('SELECT * FROM drivers WHERE lower(name)=lower(?)', (name,)).fetchone()
    if driver:
        return driver
    cursor = db.execute(
        'INSERT INTO drivers(name, vehicle, vehicle_type, online, status, capacity, wallet, verified) VALUES(?,?,?,?,?,?,?,?)',
        (name, 'KL 07 EV 8891', 'Sedan (EV)', 1, 'AVAILABLE', 4, 0, 1)
    )
    return db.execute('SELECT * FROM drivers WHERE id=?', (cursor.lastrowid,)).fetchone()

def cleanup_stale_prototype_bookings(db):
    """
    Auto-prunes stale/inactive unassigned bookings and open clusters created > 10 minutes ago.
    """
    try:
        db.execute(
            '''UPDATE bookings SET status="cancelled" 
               WHERE status IN ("confirmed", "open") 
                 AND (
                   cluster_id IS NULL AND datetime(created_at) < datetime('now', '-10 minutes')
                   OR cluster_id IN (SELECT id FROM clusters WHERE status="open" AND driver_id IS NULL AND datetime(created_at) < datetime('now', '-10 minutes'))
                 )'''
        )
        db.execute(
            '''UPDATE clusters SET status="cancelled" 
               WHERE status="open" AND driver_id IS NULL 
                 AND datetime(created_at) < datetime('now', '-10 minutes')'''
        )
    except Exception:
        pass

def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/*": {"origins": "*"}})
    initialize()

    @app.get('/')
    def index():
        return jsonify(service='kmrl-unified-ticketing-api', status='ok', health='/api/health')

    @app.get('/api/health')
    def health():
        return jsonify(status='ok', service='kmrl-unified-ticketing-api', database='ready')

    @app.get('/api/stations')
    def stations():
        return jsonify(stations=STATIONS, zones=STATION_ZONES)

    @app.post('/api/auth/login')
    def auth_login():
        data = request.get_json(silent=True) or {}
        username = str(data.get('username', '')).strip()
        password = str(data.get('password', '')).strip()
        role = str(data.get('role', 'passenger')).lower().strip()
        
        if not username:
            return jsonify(error='Username is required.'), 400
        
        valid = False
        if role == 'admin' and password in ('123', 'kmrladmin123'):
            valid = True
        elif role in ('passenger', 'driver') and password == '123':
            valid = True
            
        if not valid:
            return jsonify(error='Invalid credentials. Use demo password "123".'), 401
            
        driver_id = None
        if role == 'driver':
            with connect() as db:
                driver = get_or_create_driver(db, username)
                driver_id = driver['id']
                
        token_payload = {
            'name': username,
            'role': role,
            'driver_id': driver_id
        }
        token = create_token(token_payload)
        return jsonify(
            status='ok',
            token=token,
            user={'name': username, 'role': role, 'driver_id': driver_id}
        )

    @app.get('/api/drivers')
    def list_drivers():
        with connect() as db:
            drivers = [row(d) for d in db.execute('SELECT id, name, vehicle, vehicle_type, online, status, capacity, wallet, verified FROM drivers ORDER BY id').fetchall()]
            return jsonify(drivers=drivers)

    @app.post('/api/drivers/status')
    @require_auth(roles=['driver', 'admin'])
    def driver_status():
        user = get_auth_user()
        data = request.get_json(silent=True) or {}
        
        name = user.get('name') if user.get('role') == 'driver' else str(data.get('driver_name', '')).strip()
        status = data.get('status', 'AVAILABLE').upper()
        if status not in ('AVAILABLE', 'BUSY', 'OFFLINE'):
            status = 'AVAILABLE' if bool(data.get('online', True)) else 'OFFLINE'
        
        online = 1 if status in ('AVAILABLE', 'BUSY') else 0
        capacity = int(data.get('capacity', 4))
        if capacity < 1:
            capacity = 4
        
        if not name:
            return jsonify(error='Driver name required'), 400
        
        with connect() as db:
            driver = get_or_create_driver(db, name)
            db.execute(
                'UPDATE drivers SET online=?, status=?, capacity=? WHERE id=?',
                (online, status, capacity, driver['id'])
            )
            return jsonify(status='ok', driver_name=name, driver_status=status, online=bool(online), capacity=capacity)

    @app.post('/api/journeys/quote')
    def quote():
        data = request.get_json(silent=True) or {}
        origin = station_name(data.get('origin'))
        destination = str(data.get('destination', '')).strip()
        
        if origin not in STATIONS or not destination:
            return jsonify(error='Select a valid origin station and final destination.'), 400
        
        orbit = data.get('journey_type') == 'orbit'
        quote_data = calculate_fare_engine(origin, destination, 'orbit' if orbit else 'standard')
        
        with connect() as db:
            available_capacity = get_available_capacity(db)
            online_drivers_count = db.execute('SELECT COUNT(*) FROM drivers WHERE online = 1').fetchone()[0]
            assigned_zone = assign_dynamic_pickup_zone(db, quote_data['handoff_station'])
        
        return jsonify(
            origin=origin,
            destination=destination,
            journey_type='orbit' if orbit else 'standard',
            pickup_zone=assigned_zone if orbit else None,
            online_drivers=online_drivers_count,
            available_capacity=available_capacity,
            drivers_available=available_capacity > 0,
            disclaimer="Illustrative prototype pricing",
            **quote_data
        )

    @app.post('/api/bookings')
    def book():
        user = get_auth_user()
        data = request.get_json(silent=True) or {}
        
        # Idempotency check
        idempotency_key = request.headers.get('Idempotency-Key') or data.get('idempotency_key')
        if idempotency_key:
            with connect() as db:
                cached = db.execute('SELECT response_json FROM idempotency_keys WHERE key=?', (idempotency_key,)).fetchone()
                if cached:
                    return jsonify(json.loads(cached['response_json'])), 200

        required = ('origin', 'destination', 'journey_type')
        if any(not str(data.get(key, '')).strip() for key in required):
            return jsonify(error='Missing booking details.'), 400
        
        passenger_name = (user.get('name') if user and user.get('role') == 'passenger' else data.get('passenger_name', '')).strip()
        if not passenger_name:
            return jsonify(error='Missing booking details.'), 400

        origin = station_name(data['origin'])
        destination = data['destination'].strip()
        if origin not in STATIONS:
            return jsonify(error='Select a valid origin station.'), 400
        
        orbit = data['journey_type'] == 'orbit'
        
        with connect() as db:
            # Active duplicate booking prevention (within 10 seconds)
            dup = db.execute('''
                SELECT id FROM bookings 
                WHERE lower(passenger_name)=lower(?) AND origin=? AND destination=? AND journey_type=? 
                AND status NOT IN ("cancelled", "completed")
                AND datetime(created_at) >= datetime('now', '-10 seconds')
                ORDER BY id DESC LIMIT 1
            ''', (passenger_name, origin, destination, 'orbit' if orbit else 'standard')).fetchone()
            
            if dup:
                existing = row(db.execute('SELECT * FROM bookings WHERE id=?', (dup['id'],)).fetchone())
                return jsonify(booking=existing), 200

            available_capacity = get_available_capacity(db)
            if orbit and available_capacity <= 0:
                return jsonify(
                    error='No last-mile vehicle currently available.',
                    fallback_options=[
                        'Try another vehicle',
                        'Use KMRL feeder bus service',
                        'Continue without Unified last-mile service (Metro ticket only)',
                        'Cancel / refund last-mile component'
                    ],
                    available_capacity=0
                ), 503
            
            quote_data = calculate_fare_engine(origin, destination, 'orbit' if orbit else 'standard')
            station = quote_data['handoff_station']
            assigned_zone = assign_dynamic_pickup_zone(db, station) if orbit else None
            otp = f"{random.randint(1000, 9999)}"
            
            cursor = db.execute(
                '''INSERT INTO bookings(
                    passenger_name, phone, origin, destination, nearest_station,
                    journey_type, pickup_zone, fare, metro_fare, last_mile_fare,
                    otp, status
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',
                (
                    passenger_name,
                    data.get('phone', '+91 98765 43210'),
                    origin,
                    destination,
                    station,
                    'orbit' if orbit else 'standard',
                    assigned_zone,
                    quote_data['fare'],
                    quote_data['metro_fare'],
                    quote_data['last_mile_fare'],
                    otp,
                    'confirmed'
                )
            )
            booking_id = cursor.lastrowid
            
            if orbit:
                rebuild_open_clusters(db)
            
            booking = row(db.execute('SELECT * FROM bookings WHERE id=?', (booking_id,)).fetchone())
            
            if idempotency_key:
                db.execute(
                    'INSERT OR REPLACE INTO idempotency_keys (key, booking_id, response_json) VALUES (?, ?, ?)',
                    (idempotency_key, booking_id, json.dumps({'booking': booking}))
                )
        
        return jsonify(booking=booking), 201

    @app.get('/api/bookings/<int:booking_id>')
    def booking_status(booking_id):
        user = get_auth_user()
        with connect() as db:
            booking = db.execute(
                '''SELECT b.id, b.passenger_name, b.origin, b.destination, b.nearest_station,
                          b.journey_type, b.pickup_zone, b.fare, b.metro_fare, b.last_mile_fare,
                          b.otp, b.status, b.cluster_id, b.created_at,
                          c.status AS cluster_status, c.passenger_count AS cluster_passenger_count,
                          c.pickup_zone AS assigned_zone, c.vehicle_type, c.score AS cluster_score,
                          c.detour_minutes, c.wait_minutes, c.compatibility, c.driver_id,
                          d.name AS driver_name, d.vehicle AS driver_vehicle, d.vehicle_type AS driver_vehicle_type,
                          d.verified AS driver_verified
                   FROM bookings b
                   LEFT JOIN clusters c ON b.cluster_id = c.id
                   LEFT JOIN drivers d ON c.driver_id = d.id
                   WHERE b.id = ?''',
                (booking_id,)
            ).fetchone()
            
            if not booking:
                return jsonify(error='Booking not found.'), 404
            
            booking_dict = row(booking)
            
            # Authorization / IDOR Protection
            if user:
                if user['role'] == 'passenger':
                    if booking_dict['passenger_name'].strip().lower() != user['name'].strip().lower():
                        return jsonify(error='Forbidden: Access denied to other passenger booking.', code='FORBIDDEN'), 403
                elif user['role'] == 'driver':
                    if booking_dict.get('driver_id') != user.get('driver_id'):
                        return jsonify(error='Forbidden: Access denied to unassigned booking.', code='FORBIDDEN'), 403
                    booking_dict['otp'] = None  # Hide secret OTP from driver
            else:
                # If no auth header provided, restrict access to preserve security
                return jsonify(error='Authentication required.', code='UNAUTHENTICATED'), 401
            
            return jsonify(booking=booking_dict)

    @app.post('/api/bookings/<int:booking_id>/cancel')
    @require_auth(roles=['passenger', 'admin'])
    def cancel_booking(booking_id):
        user = get_auth_user()
        with connect() as db:
            booking = db.execute('SELECT * FROM bookings WHERE id=?', (booking_id,)).fetchone()
            if not booking:
                return jsonify(error='Booking not found'), 404
            
            if user['role'] == 'passenger' and booking['passenger_name'].strip().lower() != user['name'].strip().lower():
                return jsonify(error='Forbidden: Cannot cancel another passenger\'s booking.'), 403
            
            db.execute('UPDATE bookings SET status="cancelled" WHERE id=?', (booking_id,))
            if booking['cluster_id']:
                remaining_bookings = db.execute(
                    'SELECT * FROM bookings WHERE cluster_id=? AND status != "cancelled"',
                    (booking['cluster_id'],)
                ).fetchall()
                if not remaining_bookings:
                    db.execute('UPDATE clusters SET status="cancelled", passenger_count=0, fare=0 WHERE id=?', (booking['cluster_id'],))
                else:
                    new_count = len(remaining_bookings)
                    new_fare = sum(item['last_mile_fare'] for item in remaining_bookings)
                    db.execute('UPDATE clusters SET passenger_count=?, fare=? WHERE id=?', (new_count, new_fare, booking['cluster_id']))
                    
            return jsonify(status='cancelled', refund_amount=booking['last_mile_fare'])

    @app.get('/api/clusters')
    @require_auth(roles=['driver', 'admin'])
    def clusters():
        user = get_auth_user()
        with connect() as db:
            cleanup_stale_prototype_bookings(db)
            if user['role'] == 'admin':
                rows = db.execute(
                    '''SELECT c.*, d.name AS driver_name, d.vehicle AS driver_vehicle, d.vehicle_type AS driver_vehicle_type
                       FROM clusters c 
                       LEFT JOIN drivers d ON c.driver_id=d.id 
                       WHERE c.status IN ("open","accepted","arriving","arrived","in_transit") 
                       ORDER BY c.id DESC'''
                ).fetchall()
            else:
                driver = db.execute('SELECT * FROM drivers WHERE id=?', (user.get('driver_id'),)).fetchone()
                driver_cap = driver['capacity'] if driver else 4
                driver_vtype = driver['vehicle_type'].lower() if driver else 'sedan'
                is_feeder_driver = 'bus' in driver_vtype or driver_cap >= 15
                
                if is_feeder_driver:
                    rows = db.execute(
                        '''SELECT c.*, d.name AS driver_name, d.vehicle AS driver_vehicle, d.vehicle_type AS driver_vehicle_type
                           FROM clusters c 
                           LEFT JOIN drivers d ON c.driver_id=d.id 
                           WHERE (c.driver_id = ? AND c.status IN ("accepted","arriving","arrived","in_transit"))
                              OR (c.status = "open" AND c.vehicle_type = "feeder_bus")
                           ORDER BY c.id DESC''',
                        (user.get('driver_id'),)
                    ).fetchall()
                else:
                    rows = db.execute(
                        '''SELECT c.*, d.name AS driver_name, d.vehicle AS driver_vehicle, d.vehicle_type AS driver_vehicle_type
                           FROM clusters c 
                           LEFT JOIN drivers d ON c.driver_id=d.id 
                           WHERE (c.driver_id = ? AND c.status IN ("accepted","arriving","arrived","in_transit"))
                              OR (c.status = "open" AND c.vehicle_type != "feeder_bus" AND c.passenger_count <= ?)
                           ORDER BY c.id DESC''',
                        (user.get('driver_id'), driver_cap)
                    ).fetchall()
            
            records = [cluster_payload(db, item, user) for item in rows]
        return jsonify(clusters=records)

    @app.post('/api/clusters/clear-stale')
    @require_auth(roles=['driver', 'admin'])
    def clear_stale():
        with connect() as db:
            db.execute(
                '''UPDATE bookings SET status="cancelled" 
                   WHERE status IN ("confirmed", "open") 
                     AND (
                       cluster_id IS NULL 
                       OR cluster_id IN (SELECT id FROM clusters WHERE status="open" AND driver_id IS NULL)
                     )'''
            )
            db.execute('UPDATE clusters SET status="cancelled" WHERE status="open" AND driver_id IS NULL')
            return jsonify(status='ok', message='Stale unassigned clusters cleared.')

    @app.post('/api/clusters/<int:cluster_id>/accept')
    @require_auth(roles=['driver', 'admin'])
    def accept_cluster(cluster_id):
        user = get_auth_user()
        driver_name = user.get('name') if user.get('role') == 'driver' else str((request.get_json(silent=True) or {}).get('driver_name', '')).strip()
        if not driver_name:
            return jsonify(error='Driver name is required.'), 400
        
        with connect() as db:
            cluster = db.execute('SELECT * FROM clusters WHERE id=? AND status="open"', (cluster_id,)).fetchone()
            if not cluster:
                return jsonify(error='Cluster is no longer available.'), 409
            
            driver = get_or_create_driver(db, driver_name)
            
            # Enforce vehicle capacity matching
            if driver['capacity'] < cluster['passenger_count']:
                return jsonify(error=f'Vehicle capacity ({driver["capacity"]}) is insufficient for cluster of {cluster["passenger_count"]} passengers.'), 400
            
            # Atomic state transition
            res = db.execute('UPDATE clusters SET status="accepted", driver_id=? WHERE id=? AND status="open"', (driver['id'], cluster_id))
            if res.rowcount == 0:
                return jsonify(error='Cluster already accepted by another driver.'), 409
                
            db.execute('UPDATE drivers SET status="BUSY" WHERE id=?', (driver['id'],))
            db.execute('UPDATE bookings SET status="driver_assigned" WHERE cluster_id=? AND status != "cancelled"', (cluster_id,))
            
            accepted = db.execute(
                '''SELECT c.*, d.name AS driver_name, d.vehicle AS driver_vehicle, d.vehicle_type AS driver_vehicle_type
                   FROM clusters c JOIN drivers d ON c.driver_id=d.id WHERE c.id=?''',
                (cluster_id,)
            ).fetchone()
            return jsonify(cluster=cluster_payload(db, accepted, user))

    @app.post('/api/clusters/<int:cluster_id>/arriving')
    @require_auth(roles=['driver', 'admin'])
    def set_arriving(cluster_id):
        user = get_auth_user()
        with connect() as db:
            cluster = db.execute('SELECT * FROM clusters WHERE id=? AND status="accepted"', (cluster_id,)).fetchone()
            if not cluster:
                return jsonify(error='Accepted cluster not found.'), 404
            if user['role'] == 'driver' and cluster['driver_id'] != user.get('driver_id'):
                return jsonify(error='Unauthorized: Cluster assigned to another driver.'), 403
            
            db.execute('UPDATE clusters SET status="arriving" WHERE id=?', (cluster_id,))
            db.execute('UPDATE bookings SET status="arriving" WHERE cluster_id=? AND status != "cancelled"', (cluster_id,))
            return jsonify(status='arriving', message='Driver en route to pickup bay.')

    @app.post('/api/clusters/<int:cluster_id>/arrived')
    @require_auth(roles=['driver', 'admin'])
    def set_arrived(cluster_id):
        user = get_auth_user()
        with connect() as db:
            cluster = db.execute('SELECT * FROM clusters WHERE id=? AND status IN ("accepted", "arriving")', (cluster_id,)).fetchone()
            if not cluster:
                return jsonify(error='Active cluster not found.'), 404
            if user['role'] == 'driver' and cluster['driver_id'] != user.get('driver_id'):
                return jsonify(error='Unauthorized: Cluster assigned to another driver.'), 403
            
            db.execute('UPDATE clusters SET status="arrived" WHERE id=?', (cluster_id,))
            db.execute('UPDATE bookings SET status="arrived" WHERE cluster_id=? AND status != "cancelled"', (cluster_id,))
            return jsonify(status='arrived', message='Driver arrived at pickup bay.')

    @app.post('/api/clusters/<int:cluster_id>/start-trip')
    @require_auth(roles=['driver', 'admin'])
    def start_trip(cluster_id):
        user = get_auth_user()
        data = request.get_json(silent=True) or {}
        entered_otp = str(data.get('otp', '')).strip()
        
        with connect() as db:
            cluster = db.execute('SELECT * FROM clusters WHERE id=? AND status IN ("accepted", "arriving", "arrived")', (cluster_id,)).fetchone()
            if not cluster:
                return jsonify(error='Accepted cluster not found.'), 404
            
            if user['role'] == 'driver' and cluster['driver_id'] != user.get('driver_id'):
                return jsonify(error='Unauthorized: Cluster assigned to another driver.'), 403
            
            # Fetch valid OTPs for unstarted active passengers in this cluster
            passengers = db.execute(
                'SELECT otp FROM bookings WHERE cluster_id=? AND status != "cancelled" AND status NOT IN ("in_transit", "completed")',
                (cluster_id,)
            ).fetchall()
            valid_otps = [p['otp'] for p in passengers]
            
            # Pure OTP verification: No universal backdoor
            if not entered_otp or entered_otp not in valid_otps:
                return jsonify(error=f'Invalid Passenger OTP ({entered_otp}). Ask passenger for 4-digit code.'), 400
            
            db.execute('UPDATE clusters SET status="in_transit" WHERE id=?', (cluster_id,))
            db.execute('UPDATE bookings SET status="in_transit" WHERE cluster_id=? AND status != "cancelled"', (cluster_id,))
            return jsonify(status='in_transit', message='OTP verified. Trip started successfully!')

    @app.post('/api/clusters/<int:cluster_id>/complete')
    @require_auth(roles=['driver', 'admin'])
    def complete_cluster(cluster_id):
        user = get_auth_user()
        with connect() as db:
            cluster = db.execute('SELECT * FROM clusters WHERE id=? AND status IN ("accepted", "arriving", "arrived", "in_transit")', (cluster_id,)).fetchone()
            if not cluster:
                return jsonify(error='Active cluster not found.'), 409
            
            if user['role'] == 'driver' and cluster['driver_id'] != user.get('driver_id'):
                return jsonify(error='Unauthorized: Cannot complete another driver\'s trip.'), 403
            
            # Atomic transition to completed
            res = db.execute('UPDATE clusters SET status="completed" WHERE id=? AND status IN ("accepted", "arriving", "arrived", "in_transit")', (cluster_id,))
            if res.rowcount == 0:
                return jsonify(error='Cluster already completed.'), 409
                
            driver_payout = round(cluster['fare'] * 0.75)
            db.execute('UPDATE bookings SET status="completed" WHERE cluster_id=?', (cluster_id,))
            if cluster['driver_id']:
                db.execute('UPDATE drivers SET wallet=wallet+?, status="AVAILABLE" WHERE id=?', (driver_payout, cluster['driver_id']))
            
            return jsonify(completed=True, earnings=driver_payout, total_fare=cluster['fare'])

    @app.post('/api/clusters/<int:cluster_id>/cancel-driver')
    @require_auth(roles=['driver', 'admin'])
    def cancel_driver(cluster_id):
        user = get_auth_user()
        with connect() as db:
            cluster = db.execute('SELECT * FROM clusters WHERE id=?', (cluster_id,)).fetchone()
            if not cluster:
                return jsonify(error='Cluster not found'), 404
            
            if user['role'] == 'driver' and cluster['driver_id'] != user.get('driver_id'):
                return jsonify(error='Unauthorized: Cannot cancel another driver\'s assignment.'), 403
            
            if cluster['driver_id']:
                db.execute('UPDATE drivers SET status="AVAILABLE" WHERE id=?', (cluster['driver_id'],))
            
            db.execute('UPDATE clusters SET status="open", driver_id=NULL WHERE id=?', (cluster_id,))
            db.execute('UPDATE bookings SET status="clustered" WHERE cluster_id=? AND status != "cancelled"', (cluster_id,))
            return jsonify(status='reassigned_searching', message='Driver cancelled. Finding replacement vehicle.')

    @app.post('/api/sos')
    @require_auth(roles=['passenger', 'driver'])
    def trigger_sos():
        user = get_auth_user()
        data = request.get_json(silent=True) or {}
        booking_id = data.get('booking_id')
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        
        driver_id = None
        vehicle = None
        
        with connect() as db:
            if booking_id:
                booking = db.execute('''
                    SELECT b.*, d.id as assigned_driver_id, d.vehicle as driver_vehicle
                    FROM bookings b
                    LEFT JOIN clusters c ON b.cluster_id = c.id
                    LEFT JOIN drivers d ON c.driver_id = d.id
                    WHERE b.id = ?
                ''', (booking_id,)).fetchone()
                if booking:
                    driver_id = booking['assigned_driver_id']
                    vehicle = booking['driver_vehicle']
            
            cursor = db.execute('''
                INSERT INTO sos_alerts (booking_id, passenger_name, driver_id, vehicle, latitude, longitude, status)
                VALUES (?, ?, ?, ?, ?, ?, 'TRIGGERED')
            ''', (booking_id, user['name'], driver_id, vehicle, latitude, longitude))
            sos_id = cursor.lastrowid
        
        return jsonify(
            status='ok',
            message='SOS alert sent to KMRL Control Room and Emergency Contacts.',
            sos_id=sos_id
        ), 201

    @app.get('/api/admin/metrics')
    @require_auth(roles=['admin'])
    def admin_metrics():
        with connect() as db:
            total_bookings = db.execute('SELECT COUNT(*) FROM bookings').fetchone()[0]
            completed_bookings = db.execute('SELECT COUNT(*) FROM bookings WHERE status="completed"').fetchone()[0]
            total_revenue = db.execute('SELECT COALESCE(SUM(fare), 0) FROM bookings WHERE status != "cancelled"').fetchone()[0]
            driver_payouts = db.execute('SELECT COALESCE(SUM(wallet), 0) FROM drivers').fetchone()[0]
            
            online_drivers = db.execute('SELECT COUNT(*) FROM drivers WHERE online=1').fetchone()[0]
            available_capacity = get_available_capacity(db)
            open_clusters = db.execute('SELECT COUNT(*) FROM clusters WHERE status="open"').fetchone()[0]
            active_clusters = db.execute('SELECT COUNT(*) FROM clusters WHERE status IN ("accepted", "arriving", "arrived", "in_transit")').fetchone()[0]
            
            total_active_riders = db.execute('SELECT COUNT(*) FROM bookings WHERE status IN ("clustered", "driver_assigned", "arriving", "arrived", "in_transit")').fetchone()[0]
            avg_occupancy = round(total_active_riders / max(1, active_clusters), 1) if active_clusters > 0 else 0.0
            
            kmrl_share = round(total_revenue * 0.45)
            platform_ops = round(total_revenue * 0.10)
            
            return jsonify(
                today_summary={
                    'trips': total_bookings,
                    'passengers': completed_bookings,
                    'shared_vehicles': active_clusters + online_drivers,
                    'passenger_revenue': total_revenue,
                    'driver_payout': driver_payouts,
                    'operations': platform_ops,
                    'kmrl_share': kmrl_share,
                },
                utilization={
                    'avg_occupancy': avg_occupancy,
                    'vehicle_utilization_pct': min(100, round((active_clusters / max(1, online_drivers)) * 100)) if online_drivers > 0 else 0,
                    'feeder_demand': total_active_riders,
                    'feeder_capacity': available_capacity,
                    'feeder_utilization_pct': min(100, round((total_active_riders / max(1, available_capacity)) * 100)) if available_capacity > 0 else 0
                },
                live_system={
                    'online_drivers': online_drivers,
                    'available_capacity': available_capacity,
                    'open_clusters': open_clusters,
                    'active_clusters': active_clusters
                }
            )

    return app

app = create_app()

if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('PORT', '8000')),
        debug=os.getenv('FLASK_ENV') == 'development'
    )
