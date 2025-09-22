"""
Web scraper for rush-ph.com to get train arrival times and schedules.
"""
import requests
from bs4 import BeautifulSoup
import json
import time
from typing import Dict, List, Optional, Tuple
import logging
from datetime import datetime, timedelta
import re

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RushScraper:
    """Scraper for rush-ph.com train schedule data."""
    
    def __init__(self, cache_duration: int = 300):  # 5 minutes cache
        """Initialize the scraper with caching capabilities."""
        self.base_url = "https://rush-ph.com"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.cache_duration = cache_duration
        self.cache = {}
        
    def _is_cache_valid(self, timestamp: datetime) -> bool:
        """Check if cached data is still valid."""
        return datetime.now() - timestamp < timedelta(seconds=self.cache_duration)
    
    def _get_cache_key(self, origin: str, destination: str) -> str:
        """Generate cache key for origin-destination pair."""
        return f"{origin.lower()}_{destination.lower()}"
    
    def _simulate_train_data(self, origin: str, destination: str, line: str) -> Dict:
        """
        Simulate train schedule data since rush-ph.com requires JavaScript.
        This is a fallback method that generates realistic train schedule data.
        """
        logger.info(f"Simulating train data for {origin} to {destination} on {line}")
        
        current_time = datetime.now()
        
        # Generate realistic train arrival times (every 5-12 minutes)
        train_times = []
        intervals = [5, 7, 8, 10, 12]  # Minutes between trains
        
        next_time = current_time
        for i in range(5):  # Generate next 5 trains
            minutes_ahead = sum(intervals[:(i+1)]) if i < len(intervals) else sum(intervals) + (i - len(intervals) + 1) * 8
            train_time = current_time + timedelta(minutes=minutes_ahead)
            
            train_times.append({
                'time': train_time.strftime('%H:%M'),
                'minutes_away': minutes_ahead,
                'status': 'On Time' if minutes_ahead <= 15 else 'Delayed' if minutes_ahead > 20 else 'On Time'
            })
        
        # Estimate travel time based on stations between origin and destination
        base_travel_time = 3  # 3 minutes per station
        station_count = abs(hash(origin) % 10) + 2  # Simulate station count
        estimated_travel = base_travel_time * station_count
        
        return {
            'line': line,
            'origin': origin,
            'destination': destination,
            'next_trains': train_times,
            'estimated_travel_time': estimated_travel,
            'last_updated': current_time.strftime('%Y-%m-%d %H:%M:%S'),
            'status': 'operational',
            'simulated': True  # Flag to indicate this is simulated data
        }
    
    def scrape_train_schedule(self, origin: str, destination: str, line: str) -> Optional[Dict]:
        """
        Scrape train schedule data for a specific route.
        Falls back to simulated data if scraping fails.
        """
        cache_key = self._get_cache_key(origin, destination)
        
        # Check cache first
        if cache_key in self.cache:
            cached_data, timestamp = self.cache[cache_key]
            if self._is_cache_valid(timestamp):
                logger.info(f"Returning cached data for {origin} to {destination}")
                return cached_data
        
        try:
            # Attempt to scrape real data
            logger.info(f"Attempting to scrape data for {origin} to {destination}")
            
            # Since rush-ph.com is JavaScript-heavy, we'll try a few approaches
            response = self._attempt_data_extraction(origin, destination, line)
            
            if response:
                # Cache successful response
                self.cache[cache_key] = (response, datetime.now())
                return response
            
        except Exception as e:
            logger.error(f"Error scraping data: {e}")
        
        # Fallback to simulated data
        logger.info("Falling back to simulated data")
        simulated_data = self._simulate_train_data(origin, destination, line)
        
        # Cache simulated data with shorter duration
        self.cache[cache_key] = (simulated_data, datetime.now())
        return simulated_data
    
    def _attempt_data_extraction(self, origin: str, destination: str, line: str) -> Optional[Dict]:
        """
        Attempt to extract real data from rush-ph.com.
        This method tries different approaches to get data from the SPA.
        """
        try:
            # Method 1: Check if there are API endpoints we can call directly
            api_urls = [
                f"{self.base_url}/api/schedules",
                f"{self.base_url}/api/trains",
                f"{self.base_url}/schedules",
            ]
            
            for api_url in api_urls:
                try:
                    response = self.session.get(api_url, timeout=10)
                    if response.status_code == 200 and response.content:
                        # Try to parse JSON response
                        if 'application/json' in response.headers.get('content-type', ''):
                            data = response.json()
                            if data:  # If we got data, process it
                                return self._process_api_data(data, origin, destination, line)
                except Exception as e:
                    logger.debug(f"API endpoint {api_url} failed: {e}")
                    continue
            
            # Method 2: Try to parse the main page for any embedded data
            response = self.session.get(self.base_url, timeout=10)
            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Look for JSON data in script tags
                scripts = soup.find_all('script')
                for script in scripts:
                    if script.string:
                        # Look for JSON-like data
                        if 'train' in script.string.lower() or 'schedule' in script.string.lower():
                            # Try to extract JSON data
                            json_match = re.search(r'(\{.*\})', script.string)
                            if json_match:
                                try:
                                    data = json.loads(json_match.group(1))
                                    return self._process_api_data(data, origin, destination, line)
                                except json.JSONDecodeError:
                                    continue
            
        except Exception as e:
            logger.error(f"Data extraction attempt failed: {e}")
        
        return None
    
    def _process_api_data(self, data: Dict, origin: str, destination: str, line: str) -> Dict:
        """Process API data and format it for our application."""
        # This method would process real API data if we successfully extracted it
        # For now, we'll return None to fall back to simulated data
        logger.debug("Processing API data - implementation pending")
        return None
    
    def get_line_status(self, line: str) -> Dict:
        """Get operational status for a specific train line."""
        try:
            # Attempt to get real status data
            response = self.session.get(f"{self.base_url}/status", timeout=5)
            if response.status_code == 200:
                # Process status data
                pass
        except Exception as e:
            logger.debug(f"Could not fetch line status: {e}")
        
        # Return simulated status
        return {
            'line': line,
            'status': 'operational',
            'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'message': 'Service running normally',
            'simulated': True
        }
    
    def clear_cache(self):
        """Clear the scraper cache."""
        self.cache.clear()
        logger.info("Scraper cache cleared")
    
    def get_cache_info(self) -> Dict:
        """Get information about cached data."""
        cache_info = {
            'total_entries': len(self.cache),
            'cache_duration': self.cache_duration,
            'entries': []
        }
        
        for key, (data, timestamp) in self.cache.items():
            cache_info['entries'].append({
                'key': key,
                'timestamp': timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                'valid': self._is_cache_valid(timestamp),
                'simulated': data.get('simulated', False)
            })
        
        return cache_info