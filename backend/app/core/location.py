"""
Location utilities — Haversine distance and ETA calculations.
"""

import math
from typing import Optional


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth in kilometers
    using the Haversine formula.
    """
    # Earth radius in kilometers
    R = 6371.0

    # Convert degrees to radians
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    distance = R * c
    return round(distance, 2)


def calculate_eta(distance_km: float, speed_kmh: float = 30.0) -> int:
    """
    Estimate travel time in minutes based on distance and average speed in traffic.
    Adds a minimum 2-minute buffer for arrival/parking.
    """
    if distance_km <= 0.05:
        return 0  # Already at destination

    travel_hours = distance_km / max(speed_kmh, 5.0)
    minutes = int(math.ceil(travel_hours * 60.0)) + 2
    return max(minutes, 1)
