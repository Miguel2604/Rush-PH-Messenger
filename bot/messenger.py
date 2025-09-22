"""
Facebook Messenger API handler for the Rush PH Bot.
"""
import requests
import json
import logging
from typing import Dict, List, Optional
from datetime import datetime

from .conversation import ConversationHandler
from utils.helpers import (
    extract_message_text, get_sender_id, log_interaction
)

logger = logging.getLogger(__name__)

class MessengerBot:
    """Facebook Messenger Bot handler."""
    
    def __init__(self, page_access_token: str, app_secret: str):
        """Initialize the Messenger bot."""
        self.page_access_token = page_access_token
        self.app_secret = app_secret
        self.graph_url = "https://graph.facebook.com/v18.0/me/messages"
        
        # Initialize conversation handler
        self.conversation_handler = ConversationHandler()
        
        # Bot statistics
        self.stats = {
            'messages_received': 0,
            'messages_sent': 0,
            'unique_users': set(),
            'start_time': datetime.now(),
            'last_activity': None
        }
        
        logger.info("MessengerBot initialized successfully")
    
    def send_message(self, recipient_id: str, message_text: str) -> bool:
        """
        Send a text message to a user via Facebook Messenger.
        
        Args:
            recipient_id: Facebook user ID to send message to
            message_text: Text content of the message
            
        Returns:
            bool: True if message sent successfully, False otherwise
        """
        try:
            # Prepare the message payload
            message_data = {
                'recipient': {'id': recipient_id},
                'message': {'text': message_text}
            }
            
            # Set up request headers
            headers = {
                'Content-Type': 'application/json'
            }
            
            # Set up request parameters
            params = {
                'access_token': self.page_access_token
            }
            
            # Send the message
            response = requests.post(
                self.graph_url,
                params=params,
                headers=headers,
                json=message_data,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Message sent successfully to user {recipient_id}")
                self.stats['messages_sent'] += 1
                return True
            else:
                logger.error(f"Failed to send message. Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending message to {recipient_id}: {e}")
            return False
    
    def send_typing_indicator(self, recipient_id: str) -> bool:
        """
        Send typing indicator to show bot is processing.
        
        Args:
            recipient_id: Facebook user ID
            
        Returns:
            bool: True if indicator sent successfully
        """
        try:
            message_data = {
                'recipient': {'id': recipient_id},
                'sender_action': 'typing_on'
            }
            
            headers = {'Content-Type': 'application/json'}
            params = {'access_token': self.page_access_token}
            
            response = requests.post(
                self.graph_url,
                params=params,
                headers=headers,
                json=message_data,
                timeout=5
            )
            
            return response.status_code == 200
            
        except Exception as e:
            logger.debug(f"Error sending typing indicator: {e}")
            return False
    
    def send_quick_replies(self, recipient_id: str, message_text: str, quick_replies: List[Dict]) -> bool:
        """
        Send a message with quick reply buttons.
        
        Args:
            recipient_id: Facebook user ID
            message_text: Main message text
            quick_replies: List of quick reply options
            
        Returns:
            bool: True if sent successfully
        """
        try:
            message_data = {
                'recipient': {'id': recipient_id},
                'message': {
                    'text': message_text,
                    'quick_replies': quick_replies
                }
            }
            
            headers = {'Content-Type': 'application/json'}
            params = {'access_token': self.page_access_token}
            
            response = requests.post(
                self.graph_url,
                params=params,
                headers=headers,
                json=message_data,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Quick replies sent successfully to user {recipient_id}")
                self.stats['messages_sent'] += 1
                return True
            else:
                logger.error(f"Failed to send quick replies. Status: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending quick replies to {recipient_id}: {e}")
            return False
    
    def process_message(self, webhook_data: Dict) -> None:
        """
        Process incoming webhook message from Facebook.
        
        Args:
            webhook_data: Webhook data from Facebook
        """
        try:
            # Update last activity
            self.stats['last_activity'] = datetime.now()
            
            # Extract messaging events
            entries = webhook_data.get('entry', [])
            
            for entry in entries:
                messaging_events = entry.get('messaging', [])
                
                for event in messaging_events:
                    self._handle_messaging_event(event)
                    
        except Exception as e:
            logger.error(f"Error processing webhook message: {e}")
    
    def _handle_messaging_event(self, event: Dict) -> None:
        """
        Handle a single messaging event.
        
        Args:
            event: Single messaging event from Facebook
        """
        try:
            # Extract sender ID and message text
            sender_id = get_sender_id(event)
            message_text = extract_message_text(event)
            
            if not sender_id:
                logger.warning("Could not extract sender ID from event")
                return
            
            # Track unique users
            self.stats['unique_users'].add(sender_id)
            self.stats['messages_received'] += 1
            
            # Skip if no message text (could be attachment, etc.)
            if not message_text:
                logger.debug(f"No text message from user {sender_id}")
                return
            
            logger.info(f"Processing message from {sender_id}: {message_text}")
            
            # Send typing indicator
            self.send_typing_indicator(sender_id)
            
            # Process the message through conversation handler
            response = self.conversation_handler.handle_message(sender_id, message_text)
            
            if response:
                # Check if response includes quick replies
                if isinstance(response, dict):
                    message_text = response.get('text', '')
                    quick_replies = response.get('quick_replies', [])
                    
                    if quick_replies:
                        success = self.send_quick_replies(sender_id, message_text, quick_replies)
                    else:
                        success = self.send_message(sender_id, message_text)
                else:
                    # Simple text response
                    success = self.send_message(sender_id, response)
                
                if success:
                    # Log the interaction
                    conversation_state = self.conversation_handler.get_user_state(sender_id)
                    log_interaction(sender_id, message_text, str(response), conversation_state)
                else:
                    logger.error(f"Failed to send response to user {sender_id}")
            else:
                logger.warning(f"No response generated for user {sender_id}")
                
        except Exception as e:
            logger.error(f"Error handling messaging event: {e}")
            
            # Send error message to user
            try:
                error_msg = "❌ I'm having some technical difficulties. Please try again in a moment."
                self.send_message(get_sender_id(event), error_msg)
            except:
                pass  # Don't let error handling errors crash the bot
    
    def get_user_profile(self, user_id: str) -> Optional[Dict]:
        """
        Get user profile information from Facebook.
        
        Args:
            user_id: Facebook user ID
            
        Returns:
            Optional[Dict]: User profile data or None if failed
        """
        try:
            url = f"https://graph.facebook.com/v18.0/{user_id}"
            params = {
                'fields': 'first_name,last_name,profile_pic',
                'access_token': self.page_access_token
            }
            
            response = requests.get(url, params=params, timeout=5)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.warning(f"Could not get user profile for {user_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting user profile for {user_id}: {e}")
            return None
    
    def get_current_timestamp(self) -> str:
        """Get current timestamp in ISO format."""
        return datetime.now().isoformat()
    
    def get_bot_stats(self) -> Dict:
        """
        Get bot statistics and performance data.
        
        Returns:
            Dict: Bot statistics
        """
        uptime = datetime.now() - self.stats['start_time']
        
        return {
            'bot_status': 'active',
            'uptime_seconds': int(uptime.total_seconds()),
            'messages_received': self.stats['messages_received'],
            'messages_sent': self.stats['messages_sent'],
            'unique_users': len(self.stats['unique_users']),
            'last_activity': self.stats['last_activity'].isoformat() if self.stats['last_activity'] else None,
            'start_time': self.stats['start_time'].isoformat(),
            'conversation_handler_stats': self.conversation_handler.get_stats(),
            'current_time': self.get_current_timestamp()
        }
    
    def clear_user_data(self, user_id: str) -> bool:
        """
        Clear conversation data for a specific user.
        
        Args:
            user_id: Facebook user ID
            
        Returns:
            bool: True if cleared successfully
        """
        try:
            return self.conversation_handler.clear_user_session(user_id)
        except Exception as e:
            logger.error(f"Error clearing user data for {user_id}: {e}")
            return False
    
    def broadcast_message(self, message_text: str, user_list: Optional[List[str]] = None) -> Dict:
        """
        Send a broadcast message to multiple users.
        
        Args:
            message_text: Message to broadcast
            user_list: Optional list of user IDs. If None, broadcasts to all known users.
            
        Returns:
            Dict: Broadcast results
        """
        if user_list is None:
            user_list = list(self.stats['unique_users'])
        
        results = {
            'total_users': len(user_list),
            'successful_sends': 0,
            'failed_sends': 0,
            'errors': []
        }
        
        for user_id in user_list:
            try:
                if self.send_message(user_id, message_text):
                    results['successful_sends'] += 1
                else:
                    results['failed_sends'] += 1
            except Exception as e:
                results['failed_sends'] += 1
                results['errors'].append(f"User {user_id}: {str(e)}")
        
        logger.info(f"Broadcast completed: {results['successful_sends']}/{results['total_users']} successful")
        return results