import os
import sqlite3
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
        CREATE TABLE IF NOT EXISTS drivers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, vehicle TEXT NOT NULL, online INTEGER NOT NULL DEFAULT 0, wallet REAL NOT NULL DEFAULT 0, latitude REAL, longitude REAL);
        CREATE TABLE IF NOT EXISTS clusters (id INTEGER PRIMARY KEY, origin TEXT NOT NULL, destination TEXT NOT NULL, pickup_zone TEXT NOT NULL, passenger_count INTEGER NOT NULL, estimated_minutes INTEGER NOT NULL, fare REAL NOT NULL, vehicle_type TEXT NOT NULL DEFAULT 'cab', vehicle_capacity INTEGER NOT NULL DEFAULT 5, status TEXT NOT NULL DEFAULT 'open', driver_id INTEGER, FOREIGN KEY(driver_id) REFERENCES drivers(id));
        CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY, passenger_name TEXT NOT NULL, origin TEXT NOT NULL, destination TEXT NOT NULL, nearest_station TEXT, journey_type TEXT NOT NULL CHECK(journey_type IN ('standard','orbit')), pickup_zone TEXT, fare REAL NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed', cluster_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(cluster_id) REFERENCES clusters(id));
        ''')
        booking_columns = {item[1] for item in db.execute('PRAGMA table_info(bookings)')}
        if 'nearest_station' not in booking_columns:
            db.execute('ALTER TABLE bookings ADD COLUMN nearest_station TEXT')
        if 'cluster_id' not in booking_columns:
            db.execute('ALTER TABLE bookings ADD COLUMN cluster_id INTEGER')
        cluster_columns = {item[1] for item in db.execute('PRAGMA table_info(clusters)')}
        if 'vehicle_type' not in cluster_columns:
            db.execute("ALTER TABLE clusters ADD COLUMN vehicle_type TEXT NOT NULL DEFAULT 'cab'")
        if 'vehicle_capacity' not in cluster_columns:
            db.execute('ALTER TABLE clusters ADD COLUMN vehicle_capacity INTEGER NOT NULL DEFAULT 5')
        if not db.execute('SELECT 1 FROM drivers LIMIT 1').fetchone():
            db.executemany('INSERT INTO drivers(name,vehicle,online,wallet,latitude,longitude) VALUES(?,?,?,?,?,?)', [('Rakesh Kumar','KL 07 CD 4531',1,0,10.109,76.352),('Maya S','KL 42 A 989',1,0,10.029,76.312)])
        db.execute('DELETE FROM clusters WHERE origin=? AND destination=? AND passenger_count=? AND NOT EXISTS (SELECT 1 FROM bookings WHERE bookings.cluster_id = clusters.id)', ('Aluva', 'Kakkanad', 3))
