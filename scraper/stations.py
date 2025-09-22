"""
Station data management and validation for Philippine train systems.
"""
import json
from typing import List, Dict, Optional, Tuple
import difflib

class StationManager:
    """Manages station data for MRT, LRT-1, and LRT-2 lines."""
    
    def __init__(self):
        """Initialize station data for all train lines."""
        self.stations = {
            "MRT-3": [
                "North Avenue", "Quezon Avenue", "GMA-Kamuning", "Cubao", "Santolan-Annapolis",
                "Ortigas", "Shaw Boulevard", "Boni", "Guadalupe", "Buendia", "Ayala", "Magallanes", "Taft Avenue"
            ],
            "LRT-1": [
                "Roosevelt", "Balintawak", "Monumento", "5th Avenue", "R. Papa", "Abad Santos",
                "Blumentritt", "Tayuman", "Bambang", "Doroteo Jose", "Carriedo", "Central Terminal",
                "United Nations", "Pedro Gil", "Quirino", "Vito Cruz", "Gil Puyat", "Libertad",
                "EDSA", "Baclaran"
            ],
            "LRT-2": [
                "Antipolo", "Marikina", "Santolan", "Katipunan", "Anonas", "Cubao", "Betty Go-Belmonte",
                "Gilmore", "J. Ruiz", "V. Mapa", "Pureza", "Legarda", "Recto"
            ]
        }
        
        # Create reverse mapping for quick line lookup
        self.station_to_line = {}
        for line, stations in self.stations.items():
            for station in stations:
                self.station_to_line[station.lower()] = line
    
    def get_all_stations(self) -> List[str]:
        """Get list of all station names across all lines."""
        all_stations = []
        for stations in self.stations.values():
            all_stations.extend(stations)
        return all_stations
    
    def get_line_stations(self, line: str) -> List[str]:
        """Get stations for a specific line."""
        return self.stations.get(line, [])
    
    def find_station_line(self, station_name: str) -> Optional[str]:
        """Find which line a station belongs to."""
        return self.station_to_line.get(station_name.lower())
    
    def validate_station(self, station_input: str) -> Optional[str]:
        """
        Validate and normalize station input.
        Returns the proper station name if found, None otherwise.
        """
        station_input = station_input.strip()
        all_stations = self.get_all_stations()
        
        # Exact match (case insensitive)
        for station in all_stations:
            if station.lower() == station_input.lower():
                return station
        
        # Partial match
        for station in all_stations:
            if station_input.lower() in station.lower() or station.lower() in station_input.lower():
                return station
        
        return None
    
    def get_station_suggestions(self, station_input: str, max_suggestions: int = 3) -> List[str]:
        """Get station name suggestions based on input."""
        all_stations = self.get_all_stations()
        suggestions = difflib.get_close_matches(
            station_input, 
            all_stations, 
            n=max_suggestions, 
            cutoff=0.3
        )
        return suggestions
    
    def get_route_info(self, origin: str, destination: str) -> Optional[Dict]:
        """
        Get route information between two stations.
        Returns route info if valid route, None otherwise.
        """
        origin_line = self.find_station_line(origin)
        destination_line = self.find_station_line(destination)
        
        if not origin_line or not destination_line:
            return None
        
        # Same line route
        if origin_line == destination_line:
            line_stations = self.get_line_stations(origin_line)
            try:
                origin_idx = line_stations.index(origin)
                dest_idx = line_stations.index(destination)
                
                if origin_idx == dest_idx:
                    return None  # Same station
                
                return {
                    'line': origin_line,
                    'origin': origin,
                    'destination': destination,
                    'origin_index': origin_idx,
                    'destination_index': dest_idx,
                    'direction': 'northbound' if dest_idx < origin_idx else 'southbound',
                    'stations_between': abs(dest_idx - origin_idx),
                    'transfer_required': False
                }
            except ValueError:
                return None
        
        # Inter-line route (requires transfer)
        # For now, we'll focus on same-line routes
        # This can be expanded to handle transfers at common stations
        return {
            'line': f"{origin_line} → {destination_line}",
            'origin': origin,
            'destination': destination,
            'transfer_required': True,
            'origin_line': origin_line,
            'destination_line': destination_line
        }
    
    def is_valid_route(self, origin: str, destination: str) -> bool:
        """Check if a route between two stations is valid."""
        return self.get_route_info(origin, destination) is not None