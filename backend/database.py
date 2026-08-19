import os
import sqlite3
import random
from pathlib import Path

DATABASE_PATH = Path(os.getenv('DATABASE_PATH', Path(__file__).parent / 'instance' / 'orbit.sqlite3'))

def connect():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATABASE_PATH)
    db.row_factory = sqlite3.Row
    return db

def initialize():
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS drivers (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            vehicle TEXT NOT NULL,
            vehicle_type TEXT NOT NULL DEFAULT 'Sedan',
            online INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'AVAILABLE',
            capacity INTEGER NOT NULL DEFAULT 4,
            wallet REAL NOT NULL DEFAULT 0,
            verified INTEGER NOT NULL DEFAULT 1,
            latitude REAL,
            longitude REAL
        );

        CREATE TABLE IF NOT EXISTS clusters (
            id INTEGER PRIMARY KEY,
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            pickup_zone TEXT NOT NULL,
            passenger_count INTEGER NOT NULL,
            estimated_minutes INTEGER NOT NULL,
            fare REAL NOT NULL,
            vehicle_type TEXT NOT NULL DEFAULT 'cab',
            vehicle_capacity INTEGER NOT NULL DEFAULT 4,
            status TEXT NOT NULL DEFAULT 'open',
            driver_id INTEGER,
            score INTEGER NOT NULL DEFAULT 85,
            detour_minutes INTEGER NOT NULL DEFAULT 6,
            wait_minutes INTEGER NOT NULL DEFAULT 5,
            compatibility TEXT NOT NULL DEFAULT 'High',
            FOREIGN KEY(driver_id) REFERENCES drivers(id)
        );

        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY,
            passenger_name TEXT NOT NULL,
            phone TEXT DEFAULT '+91 98765 43210',
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            nearest_station TEXT,
            journey_type TEXT NOT NULL CHECK(journey_type IN ('standard','orbit')),
            pickup_zone TEXT,
            fare REAL NOT NULL,
            metro_fare REAL NOT NULL DEFAULT 0,
            last_mile_fare REAL NOT NULL DEFAULT 0,
            otp TEXT NOT NULL DEFAULT '4721',
            status TEXT NOT NULL DEFAULT 'confirmed',
            cluster_id INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(cluster_id) REFERENCES clusters(id)
        );

        CREATE TABLE IF NOT EXISTS sos_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_id INTEGER,
            passenger_name TEXT NOT NULL,
            driver_id INTEGER,
            vehicle TEXT,
            latitude REAL,
            longitude REAL,
            status TEXT NOT NULL DEFAULT 'TRIGGERED',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(booking_id) REFERENCES bookings(id)
        );

        CREATE TABLE IF NOT EXISTS idempotency_keys (
            key TEXT PRIMARY KEY,
            booking_id INTEGER NOT NULL,
            response_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(booking_id) REFERENCES bookings(id)
        );
        ''')

        # Run safe migrations for any preexisting tables
        driver_cols = {item[1] for item in db.execute('PRAGMA table_info(drivers)')}
        if 'status' not in driver_cols:
            db.execute("ALTER TABLE drivers ADD COLUMN status TEXT NOT NULL DEFAULT 'AVAILABLE'")
        if 'capacity' not in driver_cols:
            db.execute("ALTER TABLE drivers ADD COLUMN capacity INTEGER NOT NULL DEFAULT 4")
        if 'vehicle_type' not in driver_cols:
            db.execute("ALTER TABLE drivers ADD COLUMN vehicle_type TEXT NOT NULL DEFAULT 'Sedan'")
        if 'verified' not in driver_cols:
            db.execute("ALTER TABLE drivers ADD COLUMN verified INTEGER NOT NULL DEFAULT 1")

        booking_cols = {item[1] for item in db.execute('PRAGMA table_info(bookings)')}
        if 'metro_fare' not in booking_cols:
            db.execute('ALTER TABLE bookings ADD COLUMN metro_fare REAL NOT NULL DEFAULT 0')
        if 'last_mile_fare' not in booking_cols:
            db.execute('ALTER TABLE bookings ADD COLUMN last_mile_fare REAL NOT NULL DEFAULT 0')
        if 'otp' not in booking_cols:
            db.execute("ALTER TABLE bookings ADD COLUMN otp TEXT NOT NULL DEFAULT '4721'")
        if 'phone' not in booking_cols:
            db.execute("ALTER TABLE bookings ADD COLUMN phone TEXT DEFAULT '+91 98765 43210'")

        cluster_cols = {item[1] for item in db.execute('PRAGMA table_info(clusters)')}
        if 'score' not in cluster_cols:
            db.execute('ALTER TABLE clusters ADD COLUMN score INTEGER NOT NULL DEFAULT 85')
        if 'detour_minutes' not in cluster_cols:
            db.execute('ALTER TABLE clusters ADD COLUMN detour_minutes INTEGER NOT NULL DEFAULT 6')
        if 'wait_minutes' not in cluster_cols:
            db.execute('ALTER TABLE clusters ADD COLUMN wait_minutes INTEGER NOT NULL DEFAULT 5')
        if 'compatibility' not in cluster_cols:
            db.execute("ALTER TABLE clusters ADD COLUMN compatibility TEXT NOT NULL DEFAULT 'High'")

        # Ensure seed drivers exist
        if not db.execute('SELECT 1 FROM drivers LIMIT 1').fetchone():
            db.executemany(
                'INSERT INTO drivers(name,vehicle,vehicle_type,online,status,capacity,wallet,verified,latitude,longitude) VALUES(?,?,?,?,?,?,?,?,?,?)',
                [
                    ('Rakesh Kumar', 'KL 07 CD 4531', 'Sedan (EV)', 1, 'AVAILABLE', 4, 1250, 1, 10.109, 76.352),
                    ('Maya S', 'KL 42 A 0989', 'Hatchback (EV)', 1, 'AVAILABLE', 4, 840, 1, 10.029, 76.312),
                    ('Anil Varma', 'KL 07 EQ 1120', 'KMRL Feeder Bus', 1, 'AVAILABLE', 20, 3100, 1, 9.971, 76.280),
                    ('Suresh G', 'KL 07 BG 5621', 'SUV', 0, 'OFFLINE', 6, 450, 1, 10.015, 76.320),
                ]
            )
