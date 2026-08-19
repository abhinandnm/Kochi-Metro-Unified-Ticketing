import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from database import connect, initialize

def clear_all_queues():
    initialize()
    with connect() as db:
        # Cancel all uncompleted passenger bookings
        db.execute('UPDATE bookings SET status="cancelled" WHERE status != "completed"')
        # Cancel all uncompleted clusters
        db.execute('UPDATE clusters SET status="cancelled" WHERE status != "completed"')
        # Reset drivers to AVAILABLE
        db.execute('UPDATE drivers SET status="AVAILABLE"')
        db.commit()
    print("[OK] All passenger queues and active clusters have been successfully cleared!")

if __name__ == '__main__':
    clear_all_queues()
