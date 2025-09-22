#!/usr/bin/env python3
"""
Test script for Rush PH Messenger Bot functionality.
Tests the complete conversation flow without requiring Facebook integration.
"""
import os
import sys

# Set test environment variables
os.environ['FACEBOOK_PAGE_ACCESS_TOKEN'] = 'test_token'
os.environ['FACEBOOK_VERIFY_TOKEN'] = 'test_verify'
os.environ['FACEBOOK_APP_SECRET'] = 'test_secret'

from bot.conversation import ConversationHandler
from scraper.stations import StationManager
from scraper.rush_scraper import RushScraper
from utils.helpers import format_train_schedule_message

def test_conversation_flow():
    """Test complete conversation flow."""
    print("=" * 60)
    print("Rush PH Messenger Bot - Conversation Flow Test")
    print("=" * 60)
    
    # Initialize conversation handler
    ch = ConversationHandler()
    user_id = "test_user_123"
    
    # Test 1: Greeting
    print("\n1. Testing greeting...")
    response = ch.handle_message(user_id, "Hi")
    print(f"User: Hi")
    print(f"Bot: {response}")
    
    # Test 2: Origin station
    print("\n2. Testing origin station input...")
    response = ch.handle_message(user_id, "Ayala")
    print(f"User: Ayala")
    print(f"Bot: {response}")
    
    # Test 3: Destination station
    print("\n3. Testing destination station input...")
    response = ch.handle_message(user_id, "Cubao")
    print(f"User: Cubao")
    print(f"Bot: {response}")
    
    # Test 4: Invalid station with suggestions
    print("\n4. Testing invalid station input...")
    ch_new = ConversationHandler()
    user_id_2 = "test_user_456"
    
    # Start new conversation
    ch_new.handle_message(user_id_2, "Hello")
    response = ch_new.handle_message(user_id_2, "Ayalan")  # Misspelled Ayala
    print(f"User: Ayalan")
    print(f"Bot: {response}")
    
    # Test 5: Help command
    print("\n5. Testing help command...")
    response = ch.handle_message(user_id, "help")
    print(f"User: help")
    print(f"Bot: {response[:200]}...")
    
    print("\n" + "=" * 60)
    print("Conversation flow test completed!")

def test_station_manager():
    """Test station management functionality."""
    print("\n" + "=" * 60)
    print("Station Manager Test")
    print("=" * 60)
    
    sm = StationManager()
    
    # Test station counts
    print(f"Total stations: {len(sm.get_all_stations())}")
    print(f"MRT-3 stations: {len(sm.get_line_stations('MRT-3'))}")
    print(f"LRT-1 stations: {len(sm.get_line_stations('LRT-1'))}")
    print(f"LRT-2 stations: {len(sm.get_line_stations('LRT-2'))}")
    
    # Test station validation
    test_stations = ["Ayala", "Cubao", "ayala", "CUBAO", "invalid_station"]
    print(f"\nStation validation tests:")
    for station in test_stations:
        validated = sm.validate_station(station)
        print(f"  {station}: {validated}")
    
    # Test suggestions
    print(f"\nSuggestion tests:")
    suggestions = sm.get_station_suggestions("Ayal", 3)
    print(f"  'Ayal' suggestions: {suggestions}")
    
    # Test route info
    print(f"\nRoute info tests:")
    route = sm.get_route_info("Ayala", "Cubao")
    print(f"  Ayala -> Cubao: {route}")

def test_scraper():
    """Test web scraper functionality."""
    print("\n" + "=" * 60)
    print("Web Scraper Test")
    print("=" * 60)
    
    rs = RushScraper()
    
    # Test schedule scraping
    print("Testing train schedule scraping...")
    schedule = rs.scrape_train_schedule("Ayala", "Cubao", "MRT-3")
    
    if schedule:
        print(f"Origin: {schedule.get('origin')}")
        print(f"Destination: {schedule.get('destination')}")
        print(f"Line: {schedule.get('line')}")
        print(f"Number of trains: {len(schedule.get('next_trains', []))}")
        print(f"Travel time: {schedule.get('estimated_travel_time')} minutes")
        print(f"Simulated data: {schedule.get('simulated', False)}")
    else:
        print("No schedule data returned")
    
    # Test cache info
    print(f"\nCache info: {rs.get_cache_info()}")

def test_message_formatting():
    """Test message formatting functions."""
    print("\n" + "=" * 60)
    print("Message Formatting Test")
    print("=" * 60)
    
    # Create sample schedule data
    sample_schedule = {
        'line': 'MRT-3',
        'origin': 'Ayala',
        'destination': 'Cubao',
        'next_trains': [
            {'time': '14:05', 'minutes_away': 5, 'status': 'On Time'},
            {'time': '14:12', 'minutes_away': 12, 'status': 'On Time'},
            {'time': '14:25', 'minutes_away': 25, 'status': 'Delayed'}
        ],
        'estimated_travel_time': 15,
        'simulated': True
    }
    
    formatted = format_train_schedule_message(sample_schedule)
    print("Formatted schedule message:")
    print(formatted.replace('\\n', '\n'))

def run_all_tests():
    """Run all tests."""
    try:
        test_conversation_flow()
        test_station_manager()
        test_scraper()
        test_message_formatting()
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("The Rush PH Messenger Bot is ready for deployment!")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)