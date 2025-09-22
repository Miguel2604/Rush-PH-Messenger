#!/usr/bin/env python3
"""
Demo script showing the Quick Replies feature in action.
"""
import os
import sys

# Set test environment variables
os.environ['FACEBOOK_PAGE_ACCESS_TOKEN'] = 'test_token'
os.environ['FACEBOOK_VERIFY_TOKEN'] = 'test_verify'
os.environ['FACEBOOK_APP_SECRET'] = 'test_secret'

from bot.conversation import ConversationHandler

def print_response(user_input, response, step_number):
    """Pretty print the conversation step."""
    print(f"\n{step_number} User types: '{user_input}'")
    print("-" * 60)
    
    if isinstance(response, dict):
        print("🤖 Bot responds:")
        print(response['text'].replace('\\n', '\n'))
        print()
        print("📱 Quick Reply Buttons appear above the message input:")
        for i, qr in enumerate(response.get('quick_replies', []), 1):
            print(f"  [{i}] {qr['title']}")
    else:
        print("🤖 Bot responds:")
        print(response.replace('\\n', '\n'))
    print()

def demo_quick_replies_flow():
    """Demonstrate the complete quick replies flow."""
    print("=" * 70)
    print("🔥 RUSH PH MESSENGER BOT - QUICK REPLIES DEMO")
    print("=" * 70)
    print("🎯 This shows how users can select train stations using buttons!")
    
    ch = ConversationHandler()
    user_id = "demo_user"
    
    # Step 1: User starts conversation
    response = ch.handle_message(user_id, "Hello")
    print_response("Hello", response, "1️⃣")
    
    # Step 2: User clicks "🚇 MRT-3" button
    response = ch.handle_message(user_id, "MRT-3")
    print_response("[User clicks: 🚇 MRT-3]", response, "2️⃣")
    
    # Step 3: User clicks "Ayala" station button
    response = ch.handle_message(user_id, "Ayala")
    print_response("[User clicks: Ayala]", response, "3️⃣")
    
    # Step 4: User clicks "🚆 LRT-2" for destination
    response = ch.handle_message(user_id, "LRT-2")
    print_response("[User clicks: 🚆 LRT-2]", response, "4️⃣")
    
    # Step 5: User clicks "Cubao" destination
    response = ch.handle_message(user_id, "Cubao")
    print_response("[User clicks: Cubao]", response, "5️⃣")
    
    print("=" * 70)
    print("✨ DEMO COMPLETE!")
    print("🎊 Users can now easily select stations using quick reply buttons!")
    print("=" * 70)

def demo_features():
    """Show key features of the quick replies system."""
    print("\n🚀 KEY FEATURES:")
    print("• 📱 Quick reply buttons for train lines (MRT-3, LRT-1, LRT-2)")
    print("• 🚉 Station buttons for each train line")
    print("• 📜 'More stations' for lines with >10 stations")
    print("• ↩️ 'Back to Lines' navigation")
    print("• ✍️ 'Type Station' option for direct text input")
    print("• 🔄 Seamless integration with existing text-based flow")
    
    print("\n🎯 USER EXPERIENCE:")
    print("• Faster station selection (no typing needed)")
    print("• No spelling mistakes")
    print("• Visual station browsing")
    print("• Mobile-friendly interface")
    print("• Works alongside text input")

if __name__ == "__main__":
    demo_quick_replies_flow()
    demo_features()