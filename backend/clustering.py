"""
Smart Passenger Clustering Engine for KMRL Last-Mile Coordination.
Evaluates:
1. Destination distance
2. Corridor & Route compatibility
3. Vehicle capacity limits
4. Waiting time bounds (MAX_WAIT_TIME = 10 min)
5. Route deviation bounds (MAX_DETOUR = 15 min)
6. Dynamic cluster scoring (0-100%)
"""

from collections import defaultdict

MAX_WAIT_TIME = 10  # Maximum acceptable passenger wait time (minutes)
MAX_DETOUR = 15     # Maximum acceptable detour deviation (minutes)

CORRIDORS = {
    'Vyttila': {
        'kakkanad': 'Vyttila-Kakkanad Corridor',
        'infopark': 'Vyttila-Kakkanad Corridor',
        'smartcity': 'Vyttila-Kakkanad Corridor',
        'mobility hub': 'Vyttila Hub Local',
        'tripunithura': 'Vyttila-Tripunithura Link',
    },
    'MG Road': {
        'marine drive': 'Marine Drive Promenade',
        'fort kochi': 'West Kochi / Ferry Corridor',
        'mg road': 'Central Commercial Core',
    },
    'Edappally': {
        'lulu': 'Lulu / Toll Junction Bypass',
        'edappally': 'Edappally Core',
    },
    'Aluva': {
        'aluva': 'Aluva Town / Airport Feeder',
    }
}

DESTINATION_KM = {
    'lulu': 2.5,
    'mobility hub': 1.5,
    'mg road': 1.0,
    'marine drive': 2.0,
    'fort kochi': 6.5,
    'infopark': 7.5,
    'smartcity': 8.5,
    'tripunithura': 3.0,
    'kakkanad': 6.0
}

def get_destination_km(dest_str):
    dest = dest_str.lower()
    for k, v in DESTINATION_KM.items():
        if k in dest:
            return v
    return 4.0

def get_corridor(station, dest_str):
    dest = dest_str.lower()
    station_corridors = CORRIDORS.get(station, {})
    for k, corridor in station_corridors.items():
        if k in dest:
            return corridor
    return f"{station} General Feeder"

def evaluate_cluster_compatibility(station, group, is_feeder_bus=False):
    """
    Evaluates group route compatibility, detour, waiting time, and cluster score.
    Returns (cluster_score, estimated_detour, estimated_wait, compatibility, approved).
    """
    count = len(group)
    if count == 0:
        return 0, 0, 0, 'None', False

    # Check if all passengers share the exact same corridor
    corridors = {get_corridor(station, item['destination']) for item in group}
    is_same_corridor = len(corridors) == 1

    # Distinct stops along the corridor
    distinct_destinations = len({item['destination'].strip().lower() for item in group})
    
    if is_feeder_bus:
        # Feeder bus follows fixed corridor line
        estimated_detour = min(12, max(0, (distinct_destinations - 1) * 2))
        estimated_wait = 8
        base_score = 90 if is_same_corridor else 50
    else:
        # Shared cab detour: 3 min per distinct additional drop-off location
        estimated_detour = max(0, (distinct_destinations - 1) * 3)
        # Waiting buffer: 3 min base + 2 min per additional rider
        estimated_wait = min(15, 3 + (count - 1) * 2)
        base_score = 95 if is_same_corridor else 55

    # Score calculation
    detour_penalty = estimated_detour * 2
    wait_penalty = estimated_wait * 1.5
    cluster_score = max(30, min(98, round(base_score - detour_penalty - wait_penalty + (count * 3))))

    compatibility = 'High' if cluster_score >= 80 else 'Medium' if cluster_score >= 65 else 'Low'

    # Hard threshold limits: must be same corridor, wait <= MAX_WAIT_TIME, detour <= MAX_DETOUR, score >= 60
    approved = is_same_corridor and (estimated_wait <= MAX_WAIT_TIME) and (estimated_detour <= MAX_DETOUR) and (cluster_score >= 60)

    return cluster_score, estimated_detour, estimated_wait, compatibility, approved

