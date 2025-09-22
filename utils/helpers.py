"""
Utility functions for the Rush PH Messenger Bot.
"""
import hashlib
import hmac
import json
from typing import Dict, List, Optional, Any
import re
from datetime import datetime

def verify_webhook_signature(payload: str, signature: str, app_secret: str) -> bool:
    """
    Verify Facebook webhook signature for security.
    
    Args:
        payload: The raw request payload
        signature: The X-Hub-Signature-256 header value
        app_secret: Facebook app secret
    
    Returns:
        bool: True if signature is valid, False otherwise
    """
    if not signature.startswith('sha256='):
        return False
    
    expected_signature = 'sha256=' + hmac.new(
        app_secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature)

def format_train_schedule_message(schedule_data: Dict) -> str:
    """
    Format train schedule data into a user-friendly message.
    
    Args:
        schedule_data: Dictionary containing train schedule information
    
    Returns:
        str: Formatted message string
    """
    if not schedule_data:
        return "❌ Sorry, I couldn't get train schedule information right now. Please try again later."
    
    line = schedule_data.get('line', 'Unknown Line')
    origin = schedule_data.get('origin', 'Unknown')
    destination = schedule_data.get('destination', 'Unknown')
    trains = schedule_data.get('next_trains', [])
    travel_time = schedule_data.get('estimated_travel_time', 'Unknown')
    last_updated = schedule_data.get('last_updated', 'Unknown')
    is_simulated = schedule_data.get('simulated', False)
    
    # Build the message
    message = f"🚆 {line}: {origin} → {destination}\\n\\n"
    
    if trains:
        message += "⏰ Next trains:\\n"
        for i, train in enumerate(trains[:3]):  # Show only first 3 trains
            time_str = train.get('time', 'Unknown')
            minutes = train.get('minutes_away', 0)
            status = train.get('status', 'Unknown')
            
            if minutes <= 1:
                time_desc = "Now"
            elif minutes <= 5:
                time_desc = f"{minutes} min"
            else:
                time_desc = f"{minutes} mins"
            
            status_emoji = "🟢" if status == "On Time" else "🟡" if status == "Delayed" else "⚫"
            message += f"• {time_str} ({time_desc}) {status_emoji}\\n"
    else:
        message += "❌ No train schedule available\\n"
    
    message += f"\\n🕐 Estimated travel time: {travel_time} minutes"
    
    if is_simulated:
        message += "\\n\\n📝 *Note: This is simulated data for demonstration purposes*"
    
    return message

def format_station_suggestions(suggestions: List[str], original_input: str) -> str:
    """
    Format station suggestions into a user-friendly message.
    
    Args:
        suggestions: List of suggested station names
        original_input: Original user input
    
    Returns:
        str: Formatted suggestions message
    """
    if not suggestions:
        return f"❌ Sorry, I couldn't find a station matching '{original_input}'. Please check the spelling and try again."
    
    message = f"🤔 I couldn't find '{original_input}' exactly. Did you mean:\\n\\n"
    
    for i, suggestion in enumerate(suggestions, 1):
        message += f"{i}. {suggestion}\\n"
    
    message += "\\nPlease type the correct station name or choose from the suggestions above."
    
    return message

def clean_user_input(text: str) -> str:
    """
    Clean and normalize user input.
    
    Args:
        text: Raw user input text
    
    Returns:
        str: Cleaned text
    """
    if not text:
        return ""
    
    # Remove extra whitespace and normalize
    text = text.strip()
    text = re.sub(r'\s+', ' ', text)  # Replace multiple spaces with single space
    
    # Remove special characters but preserve hyphens, dots, and underscores for station/line names
    text = re.sub(r'[^a-zA-Z0-9\s\-\._]', '', text)
    
    return text

def is_greeting(text: str) -> bool:
    """
    Check if user input is a greeting.
    
    Args:
        text: User input text
    
    Returns:
        bool: True if input appears to be a greeting
    """
    greetings = [
        'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
        'kumusta', 'kamusta', 'start', 'begin', 'help', 'aloha', 'yo', 'sup'
    ]
    
    text_lower = text.lower().strip()
    
    return any(greeting in text_lower for greeting in greetings)

def get_error_message(error_type: str) -> str:
    """
    Get appropriate error message based on error type.
    
    Args:
        error_type: Type of error ('network', 'invalid_station', 'same_station', 'no_data')
    
    Returns:
        str: User-friendly error message
    """
    error_messages = {
        'network': "🔌 I'm having trouble connecting to the train schedule service. Please try again in a few moments.",
        'invalid_station': "❌ I couldn't find that station. Please make sure you've entered a valid train station name.",
        'same_station': "🤔 You've entered the same station for both origin and destination. Please choose different stations.",
        'no_data': "📭 No train schedule data is available for this route right now. Please try again later.",
        'server_error': "⚠️ I'm experiencing technical difficulties. Please try again later.",
        'timeout': "⏱️ The request is taking too long. Please try again."
    }
    
    return error_messages.get(error_type, "❌ Something went wrong. Please try again.")

def validate_facebook_request(data: Dict) -> bool:
    """
    Validate that the request is from Facebook Messenger.
    
    Args:
        data: Request data dictionary
    
    Returns:
        bool: True if request is valid Facebook Messenger format
    """
    try:
        # Check basic structure
        if 'object' not in data or 'entry' not in data:
            return False
        
        if data['object'] != 'page':
            return False
        
        # Check entry structure
        entries = data.get('entry', [])
        if not entries:
            return False
        
        for entry in entries:
            if 'messaging' not in entry:
                continue
            
            messaging_events = entry.get('messaging', [])
            for event in messaging_events:
                if 'sender' in event and 'recipient' in event:
                    return True
        
        return False
    
    except Exception:
        return False

def extract_message_text(messaging_event: Dict) -> Optional[str]:
    """
    Extract text message from Facebook Messenger event.
    
    Args:
        messaging_event: Messenger event dictionary
    
    Returns:
        Optional[str]: Extracted message text or None
    """
    try:
        message = messaging_event.get('message', {})
        return message.get('text')
    except Exception:
        return None

def get_sender_id(messaging_event: Dict) -> Optional[str]:
    """
    Extract sender ID from Facebook Messenger event.
    
    Args:
        messaging_event: Messenger event dictionary
    
    Returns:
        Optional[str]: Sender ID or None
    """
    try:
        sender = messaging_event.get('sender', {})
        return sender.get('id')
    except Exception:
        return None

def log_interaction(user_id: str, message: str, response: str, conversation_state: str):
    """
    Log user interactions for debugging and analytics.
    
    Args:
        user_id: User identifier
        message: User message
        response: Bot response
        conversation_state: Current conversation state
    """
    timestamp = datetime.now().isoformat()
    
    # In a production environment, you would log to a proper logging service
    # For now, we'll just print to console
    print(f"[{timestamp}] User {user_id} ({conversation_state}): {message}")
    print(f"[{timestamp}] Bot response: {response}")

def format_welcome_message() -> str:
    """
    Get the welcome message for new users.
    
    Returns:
        str: Welcome message
    """
    return (
        "🚆 Welcome to Rush PH Bot! 👋\\n\\n"
        "I can help you get real-time train arrival times for MRT, LRT-1, and LRT-2.\\n\\n"
        "Just tell me your current train station to get started!"
    )