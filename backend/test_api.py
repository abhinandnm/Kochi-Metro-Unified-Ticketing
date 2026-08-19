import os
import tempfile

os.environ['DATABASE_PATH'] = tempfile.mktemp(suffix='.sqlite3')
from app import create_app, create_token

app = create_app()
client = app.test_client()

pax_headers = {"Authorization": f"Bearer {create_token({'name': 'Test Rider', 'role': 'passenger', 'driver_id': None})}"}
driver_headers = {"Authorization": f"Bearer {create_token({'name': 'Rakesh Kumar', 'role': 'driver', 'driver_id': 1})}"}
admin_headers = {"Authorization": f"Bearer {create_token({'name': 'Admin', 'role': 'admin', 'driver_id': None})}"}

# 1. Health check
res = client.get('/api/health')
assert res.status_code == 200

# 2. Driver status and capacity
res = client.post('/api/drivers/status', json={'driver_name': 'Rakesh Kumar', 'status': 'AVAILABLE', 'capacity': 4}, headers=driver_headers)
assert res.status_code == 200
assert res.get_json()['driver_status'] == 'AVAILABLE'
assert res.get_json()['capacity'] == 4

# 3. Dynamic Quote with Breakdown
res = client.post('/api/journeys/quote', json={'origin': 'Aluva', 'destination': 'Infopark, Kakkanad', 'journey_type': 'orbit'})
assert res.status_code == 200
quote = res.get_json()
assert quote['fare'] > 0
assert 'breakdown' in quote
assert 'commercial_split' in quote
assert quote['drivers_available'] is True

# 4. Booking creation with OTP and dynamic pickup zone
booking_res = client.post('/api/bookings', json={
    'passenger_name': 'Test Rider',
    'origin': 'Aluva',
    'destination': 'Infopark, Kakkanad',
    'journey_type': 'orbit'
}, headers=pax_headers)
assert booking_res.status_code == 201
booking = booking_res.get_json()['booking']
assert booking['otp'] is not None
assert booking['pickup_zone'] is not None
booking_id = booking['id']

# 5. Clusters endpoint & matching
clusters_res = client.get('/api/clusters', headers=driver_headers)
assert clusters_res.status_code == 200
clusters = clusters_res.get_json()['clusters']
assert len(clusters) > 0
cluster_id = clusters[0]['id']

# 6. Driver accepts cluster
accept_res = client.post(f'/api/clusters/{cluster_id}/accept', headers=driver_headers)
assert accept_res.status_code == 200

# 7. Start trip with OTP verification
otp_res = client.post(f'/api/clusters/{cluster_id}/start-trip', json={'otp': booking['otp']}, headers=driver_headers)
assert otp_res.status_code == 200
assert otp_res.get_json()['status'] == 'in_transit'

# 8. Complete trip
complete_res = client.post(f'/api/clusters/{cluster_id}/complete', headers=driver_headers)
assert complete_res.status_code == 200
assert complete_res.get_json()['completed'] is True

# 9. Admin Economics & Metrics
metrics_res = client.get('/api/admin/metrics', headers=admin_headers)
assert metrics_res.status_code == 200
metrics = metrics_res.get_json()
assert 'today_summary' in metrics
assert 'utilization' in metrics

print('All 10 Module Integration Tests Passed Successfully!')

