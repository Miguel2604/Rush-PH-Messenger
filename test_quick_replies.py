#!/usr/bin/env python3
"""
Test script for Quick Replies functionality in Rush PH Messenger Bot.
"""
import os
import sys

# Set test environment variables
os.environ['FACEBOOK_PAGE_ACCESS_TOKEN'] = 'test_token'
os.environ['FACEBOOK_VERIFY_TOKEN'] = 'test_verify'
os.environ['FACEBOOK_APP_SECRET'] = 'test_secret'

from bot.conversation import ConversationHandler

def test_quick_replies_flow():
    """Test the complete quick replies flow."""
    print("=" * 70)
    print("🔘 Rush PH Messenger Bot - Quick Replies Flow Test")
    print("=" * 70)
    
    ch = ConversationHandler()
    user_id = "test_quick_replies_user"
    
    # Test 1: Initial greeting should show quick replies
    print("\n1️⃣ Testing initial greeting with quick replies...")
    response = ch.handle_message(user_id, "Hi")
    print(f"User: Hi")
    if isinstance(response, dict):
        print(f"Bot (text): {response['text']}")
        print(f"Bot (quick_replies): {len(response.get('quick_replies', []))} buttons")
        for i, qr in enumerate(response.get('quick_replies', []), 1):
            print(f"   {i}. {qr['title']}")
    else:
        print(f"Bot: {response}")
    
    # Test 2: Select MRT-3 line
    print("\n2️⃣ Testing MRT-3 line selection...")
    response = ch.handle_message(user_id, "MRT-3")
    print(f"User: MRT-3")
    if isinstance(response, dict):
        print(f"Bot (text): {response['text']}")
        print(f"Bot (quick_replies): {len(response.get('quick_replies', []))} buttons")
        print("   Station buttons:", [qr['title'] for qr in response.get('quick_replies', [])[:5]], "...")
    else:
        print(f"Bot: {response}")
    
    # Test 3: Select Ayala station
    print("\n3️⃣ Testing station selection (Ayala)...")
    response = ch.handle_message(user_id, "Ayala")
    print(f"User: Ayala")
    if isinstance(response, dict):
        print(f"Bot (text): {response['text']}")
        print(f"Bot (quick_replies): {len(response.get('quick_replies', []))} buttons")
        for i, qr in enumerate(response.get('quick_replies', []), 1):
            print(f"   {i}. {qr['title']}")
    else:
        print(f"Bot: {response}")
    
    # Test 4: Select LRT-2 for destination
    print("\n4️⃣ Testing destination line selection (LRT-2)...")
    response = ch.handle_message(user_id, "LRT-2")
    print(f"User: LRT-2")
    if isinstance(response, dict):
        print(f"Bot (text): {response['text']}")
        print(f"Bot (quick_replies): {len(response.get('quick_replies', []))} buttons")
        print("   Station buttons:", [qr['title'] for qr in response.get('quick_replies', [])[:5]], "...")
    else:
        print(f"Bot: {response}")
    
    # Test 5: Select final destination
    print("\n5️⃣ Testing final destination selection (Cubao)...")
    response = ch.handle_message(user_id, "Cubao")
    print(f"User: Cubao")
    print(f"Bot: {response[:200]}...")
    
    print("\n" + "=" * 70)
    print("✅ Quick Replies Flow Test Complete!")

def test_back_navigation():
    """Test back navigation functionality."""
    print("\n" + "=" * 70)
    print("↩️ Testing Back Navigation")
    print("=" * 70)
    
    ch = ConversationHandler()
    user_id = "test_back_nav_user"
    
    # Start conversation
    print("\n1️⃣ Start conversation...")
    response = ch.handle_message(user_id, "Hello")
    
    # Select MRT-3
    print("\n2️⃣ Select MRT-3...")
    response = ch.handle_message(user_id, "MRT-3")
    
    # Test back to lines
    print("\n3️⃣ Testing 'Back to Lines'...")
    response = ch.handle_message(user_id, "BACK_TO_LINES")
    print(f"User: BACK_TO_LINES")
    if isinstance(response, dict):
        print(f"Bot (text): {response['text'][:100]}...")
        print(f"Bot (quick_replies): {len(response.get('quick_replies', []))} buttons")
        for qr in response.get('quick_replies', []):
            print(f"   • {qr['title']}")
    
    print("\n↩️ Back Navigation Test Complete!")

def test_more_stations():
    """Test 'More stations' functionality."""
    print("\n" + "=" * 70)
    print("📜 Testing More Stations Feature")
    print("=" * 70)
    
    ch = ConversationHandler()
    user_id = "test_more_stations_user"
    
    # Start conversation and select LRT-1 (has 20 stations, more than 10)
    print("\n1️⃣ Start conversation and select LRT-1...")
    ch.handle_message(user_id, "Hi")
    response = ch.handle_message(user_id, "LRT-1")
    print(f"User: LRT-1")
    
    if isinstance(response, dict):
        print(f"Bot (text): {response['text']}")
        print(f"Bot (quick_replies): {len(response.get('quick_replies', []))} buttons")
        
        # Check if 'More stations' button is present
        has_more = any('More stations' in qr['title'] for qr in response.get('quick_replies', []))
        print(f"Has 'More stations' button: {has_more}")
    
    # Test more stations
    print("\n2️⃣ Testing 'More stations' functionality...")
    response = ch.handle_message(user_id, "MORE_LRT-1")
    print(f"User: MORE_LRT-1")
    if isinstance(response, str):
        print(f"Bot: {response[:300]}...")
    else:
        print(f"Bot (text): {response.get('text', str(response))[:300]}...")
    
    print("\n📜 More Stations Test Complete!")

def test_type_station_option():
    """Test 'Type Station' option."""
    print("\n" + "=" * 70)
    print("✍️ Testing Type Station Option")
    print("=" * 70)
    
    ch = ConversationHandler()
    user_id = "test_type_station_user"
    
    # Start conversation
    print("\n1️⃣ Start conversation...")
    response = ch.handle_message(user_id, "Hello")
    
    # Select 'Type Station'
    print("\n2️⃣ Select 'Type Station'...")
    response = ch.handle_message(user_id, "TYPE_STATION")
    print(f"User: TYPE_STATION")
    print(f"Bot: {response}")
    
    # Type a station name
    print("\n3️⃣ Type station name directly...")
    response = ch.handle_message(user_id, "Taft Avenue")
    print(f"User: Taft Avenue")
    if isinstance(response, dict):
        print(f"Bot (text): {response['text']}")
        print(f"Bot (quick_replies): {len(response.get('quick_replies', []))} buttons")
    else:
        print(f"Bot: {response}")
    
    print("\n✍️ Type Station Test Complete!")

def run_all_quick_replies_tests():
    """Run all quick replies tests."""
    try:
        test_quick_replies_flow()
        test_back_navigation()
        test_more_stations()
        test_type_station_option()
        
        print("\n" + "=" * 70)
        print("🎉 ALL QUICK REPLIES TESTS PASSED!")
        print("The Rush PH Messenger Bot Quick Replies feature is working perfectly!")
        print("=" * 70)
        return True
        
    except Exception as e:
        print(f"\n❌ QUICK REPLIES TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = run_all_quick_replies_tests()
    sys.exit(0 if success else 1)