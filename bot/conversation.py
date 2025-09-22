"""
Conversation handler for the Rush PH Messenger Bot.
Manages multi-step conversation flow for train schedule queries.
"""
import logging
from typing import Dict, Optional, Union, List
from datetime import datetime, timedelta
from enum import Enum

from scraper.stations import StationManager
from scraper.rush_scraper import RushScraper
from utils.helpers import (
    clean_user_input, is_greeting, format_train_schedule_message,
    format_station_suggestions, format_welcome_message, get_error_message
)

logger = logging.getLogger(__name__)

class ConversationState(Enum):
    """Conversation states for the bot."""
    INITIAL = "initial"
    WAITING_FOR_ORIGIN = "waiting_for_origin"
    WAITING_FOR_ORIGIN_LINE = "waiting_for_origin_line"
    WAITING_FOR_ORIGIN_STATION = "waiting_for_origin_station"
    WAITING_FOR_DESTINATION = "waiting_for_destination"
    WAITING_FOR_DESTINATION_LINE = "waiting_for_destination_line"
    WAITING_FOR_DESTINATION_STATION = "waiting_for_destination_station"
    COMPLETED = "completed"

class ConversationHandler:
    """Handles conversation flow and state management."""
    
    def __init__(self):
        """Initialize the conversation handler."""
        self.station_manager = StationManager()
        self.rush_scraper = RushScraper()
        self.user_sessions = {}  # In-memory user sessions
        
        # Session timeout (1 hour)
        self.session_timeout = timedelta(hours=1)
        
        logger.info("ConversationHandler initialized")
    
    def handle_message(self, user_id: str, message: str) -> Union[str, Dict]:
        """
        Handle incoming message and return appropriate response.
        
        Args:
            user_id: User identifier
            message: User message text
            
        Returns:
            Union[str, Dict]: Response message or structured response with quick replies
        """
        try:
            # Clean the user input
            cleaned_message = clean_user_input(message)
            
            if not cleaned_message:
                return get_error_message('invalid_station')
            
            # Get or create user session
            session = self._get_user_session(user_id)
            current_state = session.get('state', ConversationState.INITIAL)
            
            # Log the conversation state
            logger.info(f"User {user_id} in state {current_state.value}: {cleaned_message}")
            
            # Handle message based on current state
            if current_state == ConversationState.INITIAL:
                return self._handle_initial_state(user_id, cleaned_message)
            elif current_state == ConversationState.WAITING_FOR_ORIGIN:
                return self._handle_origin_input(user_id, cleaned_message)
            elif current_state == ConversationState.WAITING_FOR_ORIGIN_LINE:
                return self._handle_origin_line_selection(user_id, cleaned_message)
            elif current_state == ConversationState.WAITING_FOR_ORIGIN_STATION:
                return self._handle_origin_station_selection(user_id, cleaned_message)
            elif current_state == ConversationState.WAITING_FOR_DESTINATION:
                return self._handle_destination_input(user_id, cleaned_message)
            elif current_state == ConversationState.WAITING_FOR_DESTINATION_LINE:
                return self._handle_destination_line_selection(user_id, cleaned_message)
            elif current_state == ConversationState.WAITING_FOR_DESTINATION_STATION:
                return self._handle_destination_station_selection(user_id, cleaned_message)
            else:
                # Reset to initial state if in unknown state
                self._set_user_state(user_id, ConversationState.INITIAL)
                return self._handle_initial_state(user_id, cleaned_message)
                
        except Exception as e:
            logger.error(f"Error handling message from {user_id}: {e}")
            return get_error_message('server_error')
    
    def _handle_initial_state(self, user_id: str, message: str) -> Union[str, Dict]:
        """
        Handle messages when user is in initial state.
        
        Args:
            user_id: User identifier
            message: User message
            
        Returns:
            Union[str, Dict]: Response message or structured response with quick replies
        """
        # Check if it's a greeting or if user is starting fresh
        if is_greeting(message) or message.lower() in ['start', 'begin', 'restart']:
            self._set_user_state(user_id, ConversationState.WAITING_FOR_ORIGIN)
            return self._get_origin_selection_options()
        
        # User might have directly provided a station name
        # Try to validate it as an origin station
        validated_station = self.station_manager.validate_station(message)
        
        if validated_station:
            # Valid station provided directly
            self._set_user_data(user_id, 'origin', validated_station)
            self._set_user_state(user_id, ConversationState.WAITING_FOR_DESTINATION)
            
            return self._get_destination_selection_options(validated_station)
        else:
            # Invalid station, provide suggestions
            suggestions = self.station_manager.get_station_suggestions(message)
            if suggestions:
                # Set state to waiting for origin and show suggestions
                self._set_user_state(user_id, ConversationState.WAITING_FOR_ORIGIN)
                return format_station_suggestions(suggestions, message)
            else:
                # No suggestions found
                self._set_user_state(user_id, ConversationState.WAITING_FOR_ORIGIN)
                return (
                    f"🤔 I couldn't find a station matching '{message}'. "
                    "Please check the spelling and try again, or type 'help' to see available stations."
                )
    
    def _handle_origin_input(self, user_id: str, message: str) -> Union[str, Dict]:
        """
        Handle origin station input.
        
        Args:
            user_id: User identifier
            message: User message
            
        Returns:
            Union[str, Dict]: Response message or structured response
        """
        # Special commands
        if message.lower() == 'help':
            return self._get_help_message()
        
        if message.lower() in ['restart', 'start over']:
            self._clear_user_session(user_id)
            self._set_user_state(user_id, ConversationState.WAITING_FOR_ORIGIN)
            return self._get_origin_selection_options()
        
        if message.lower() == 'buttons' or message.lower() == 'quick replies':
            self._set_user_state(user_id, ConversationState.WAITING_FOR_ORIGIN)
            return self._get_origin_selection_options()
        
        # Check if user selected a train line
        if message.upper() in ['MRT-3', 'LRT-1', 'LRT-2']:
            self._set_user_state(user_id, ConversationState.WAITING_FOR_ORIGIN_LINE)
            return self._handle_origin_line_selection(user_id, message)
        
        # Validate station
        validated_station = self.station_manager.validate_station(message)
        
        if validated_station:
            # Valid origin station
            self._set_user_data(user_id, 'origin', validated_station)
            self._set_user_state(user_id, ConversationState.WAITING_FOR_DESTINATION)
            
            return self._get_destination_selection_options(validated_station)
        else:
            # Invalid station, provide suggestions and quick reply option
            suggestions = self.station_manager.get_station_suggestions(message)
            if suggestions:
                suggestion_text = format_station_suggestions(suggestions, message)
                suggestion_text += "\n\nOr use quick replies by typing 'buttons' 🔘"
                return suggestion_text
            else:
                return {
                    'text': (
                        f"❌ Sorry, I couldn't find '{message}'. "
                        "Please try again or use the quick reply buttons below:"
                    ),
                    'quick_replies': [
                        {'content_type': 'text', 'title': '🚇 MRT-3', 'payload': 'MRT-3'},
                        {'content_type': 'text', 'title': '🚅 LRT-1', 'payload': 'LRT-1'},
                        {'content_type': 'text', 'title': '🚆 LRT-2', 'payload': 'LRT-2'},
                        {'content_type': 'text', 'title': '🆘 Help', 'payload': 'help'}
                    ]
                }
    
    def _handle_destination_input(self, user_id: str, message: str) -> Union[str, Dict]:
        """
        Handle destination station input and provide train schedule.
        
        Args:
            user_id: User identifier
            message: User message
            
        Returns:
            Union[str, Dict]: Response message with train schedule or structured response
        """
        # Special commands
        if message.lower() == 'help':
            return self._get_help_message()
        
        if message.lower() in ['restart', 'start over']:
            self._clear_user_session(user_id)
            self._set_user_state(user_id, ConversationState.WAITING_FOR_ORIGIN)
            return self._get_origin_selection_options()
        
        if message.lower() == 'buttons' or message.lower() == 'quick replies':
            origin = self._get_user_data(user_id, 'origin')
            return self._get_destination_selection_options(origin)
        
        # Get origin from session
        origin = self._get_user_data(user_id, 'origin')
        
        if not origin:
            # Session data lost, restart
            self._set_user_state(user_id, ConversationState.WAITING_FOR_ORIGIN)
            return self._get_origin_selection_options()
        
        # Check if user selected a train line
        if message.upper() in ['MRT-3', 'LRT-1', 'LRT-2']:
            self._set_user_state(user_id, ConversationState.WAITING_FOR_DESTINATION_LINE)
            return self._handle_destination_line_selection(user_id, message)
        
        # Validate destination
        validated_destination = self.station_manager.validate_station(message)
        
        if not validated_destination:
            # Invalid destination, provide suggestions and quick reply option
            suggestions = self.station_manager.get_station_suggestions(message)
            if suggestions:
                suggestion_text = format_station_suggestions(suggestions, message) + f"\\n\\nReminder: You're traveling from {origin}."
                suggestion_text += "\n\nOr use quick replies by typing 'buttons' 🔘"
                return suggestion_text
            else:
                return {
                    'text': (
                        f"❌ Sorry, I couldn't find '{message}' as a destination station. "
                        f"You're traveling from {origin}. Please try again or use quick replies:"
                    ),
                    'quick_replies': [
                        {'content_type': 'text', 'title': '🚇 MRT-3', 'payload': 'MRT-3'},
                        {'content_type': 'text', 'title': '🚅 LRT-1', 'payload': 'LRT-1'},
                        {'content_type': 'text', 'title': '🚆 LRT-2', 'payload': 'LRT-2'},
                        {'content_type': 'text', 'title': '🆘 Help', 'payload': 'help'}
                    ]
                }
        
        # Check if origin and destination are the same
        if origin.lower() == validated_destination.lower():
            return get_error_message('same_station')
        
        # Validate the route
        route_info = self.station_manager.get_route_info(origin, validated_destination)
        
        if not route_info:
            return (
                f"❌ Sorry, I couldn't find a valid route from {origin} to {validated_destination}. "
                "Please check the station names and try again."
            )
        
        # Get train schedule data
        try:
            line = route_info.get('line', 'Unknown')
            schedule_data = self.rush_scraper.scrape_train_schedule(origin, validated_destination, line)
            
            if schedule_data:
                # Format and return the schedule
                response = format_train_schedule_message(schedule_data)
                
                # Reset conversation state and ask if they need another query
                self._set_user_state(user_id, ConversationState.COMPLETED)
                self._set_user_data(user_id, 'last_query_time', datetime.now())
                
                response += "\\n\\n💬 Need another route? Just send me your current station!"
                
                return response
            else:
                return get_error_message('no_data')
                
        except Exception as e:
            logger.error(f"Error getting schedule data for {user_id}: {e}")
            return get_error_message('network')
    
    def _get_user_session(self, user_id: str) -> Dict:
        """
        Get user session data, creating new session if needed.
        
        Args:
            user_id: User identifier
            
        Returns:
            Dict: User session data
        """
        # Clean up expired sessions
        self._cleanup_expired_sessions()
        
        if user_id not in self.user_sessions:
            self.user_sessions[user_id] = {
                'state': ConversationState.INITIAL,
                'data': {},
                'created_at': datetime.now(),
                'last_activity': datetime.now()
            }
        else:
            # Update last activity
            self.user_sessions[user_id]['last_activity'] = datetime.now()
        
        return self.user_sessions[user_id]
    
    def _set_user_state(self, user_id: str, state: ConversationState):
        """Set user conversation state."""
        session = self._get_user_session(user_id)
        session['state'] = state
    
    def _set_user_data(self, user_id: str, key: str, value):
        """Set user session data."""
        session = self._get_user_session(user_id)
        session['data'][key] = value
    
    def _get_user_data(self, user_id: str, key: str):
        """Get user session data."""
        session = self._get_user_session(user_id)
        return session['data'].get(key)
    
    def _clear_user_session(self, user_id: str):
        """Clear user session data."""
        if user_id in self.user_sessions:
            del self.user_sessions[user_id]
    
    def _cleanup_expired_sessions(self):
        """Remove expired user sessions."""
        current_time = datetime.now()
        expired_users = []
        
        for user_id, session in self.user_sessions.items():
            last_activity = session.get('last_activity', session.get('created_at'))
            if current_time - last_activity > self.session_timeout:
                expired_users.append(user_id)
        
        for user_id in expired_users:
            del self.user_sessions[user_id]
        
        if expired_users:
            logger.info(f"Cleaned up {len(expired_users)} expired sessions")
    
    def _get_origin_selection_options(self) -> Dict:
        """Get origin selection with quick reply options."""
        quick_replies = [
            {'content_type': 'text', 'title': '🚇 MRT-3', 'payload': 'MRT-3'},
            {'content_type': 'text', 'title': '🚅 LRT-1', 'payload': 'LRT-1'},
            {'content_type': 'text', 'title': '🚆 LRT-2', 'payload': 'LRT-2'},
            {'content_type': 'text', 'title': '✍️ Type Station', 'payload': 'TYPE_STATION'}
        ]
        
        return {
            'text': (
                format_welcome_message() + 
                "\n\n🛤️ Choose your train line to see stations, or type your current station:"
            ),
            'quick_replies': quick_replies
        }
    
    def _get_destination_selection_options(self, origin_station: str) -> Dict:
        """Get destination selection with quick reply options."""
        quick_replies = [
            {'content_type': 'text', 'title': '🚇 MRT-3', 'payload': 'MRT-3'},
            {'content_type': 'text', 'title': '🚅 LRT-1', 'payload': 'LRT-1'},
            {'content_type': 'text', 'title': '🚆 LRT-2', 'payload': 'LRT-2'},
            {'content_type': 'text', 'title': '✍️ Type Station', 'payload': 'TYPE_STATION'}
        ]
        
        return {
            'text': f"Perfect! You're at {origin_station}. \n\n🛤️ Choose destination train line or type station name:",
            'quick_replies': quick_replies
        }
    
    def _get_line_stations_quick_replies(self, line: str, is_origin: bool = True) -> Dict:
        """Get station quick replies for a specific line."""
        stations = self.station_manager.get_line_stations(line)
        quick_replies = []
        
        # Add up to 10 stations as quick replies (Facebook limit is 13)
        for station in stations[:10]:
            quick_replies.append({
                'content_type': 'text',
                'title': station,
                'payload': station
            })
        
        # Add "More stations" option if there are more than 10
        if len(stations) > 10:
            quick_replies.append({
                'content_type': 'text',
                'title': '📜 More stations',
                'payload': f'MORE_{line}'
            })
        
        # Add back option
        quick_replies.append({
            'content_type': 'text',
            'title': '← Back to Lines',
            'payload': 'BACK_TO_LINES'
        })
        
        station_type = "origin" if is_origin else "destination"
        message = f"🚉 {line} Stations - Select your {station_type}:"
        
        if len(stations) > 10:
            message += f"\n\n📝 Showing first 10 of {len(stations)} stations. Tap 'More stations' or type station name."
        
        return {
            'text': message,
            'quick_replies': quick_replies
        }
    
    def _handle_origin_line_selection(self, user_id: str, message: str) -> Union[str, Dict]:
        """Handle origin line selection from quick replies."""
        message_upper = message.upper()
        
        if message_upper in ['MRT-3', 'LRT-1', 'LRT-2']:
            self._set_user_data(user_id, 'selected_origin_line', message_upper)
            self._set_user_state(user_id, ConversationState.WAITING_FOR_ORIGIN_STATION)
            return self._get_line_stations_quick_replies(message_upper, is_origin=True)
        elif message.upper() == 'TYPE_STATION':
            self._set_user_state(user_id, ConversationState.WAITING_FOR_ORIGIN)
            return "Please type your current train station:"
        else:
            # Handle as regular station input
            return self._handle_origin_input(user_id, message)
    
    def _handle_origin_station_selection(self, user_id: str, message: str) -> Union[str, Dict]:
        """Handle origin station selection from quick replies."""
        if message == 'BACK_TO_LINES':
            self._set_user_state(user_id, ConversationState.WAITING_FOR_ORIGIN)
            return self._get_origin_selection_options()
        elif message.startswith('MORE_'):
            line = message.replace('MORE_', '')
            return self._get_more_stations_message(line, is_origin=True)
        else:
            # Validate station
            validated_station = self.station_manager.validate_station(message)
            if validated_station:
                self._set_user_data(user_id, 'origin', validated_station)
                self._set_user_state(user_id, ConversationState.WAITING_FOR_DESTINATION)
                return self._get_destination_selection_options(validated_station)
            else:
                return f"❌ Invalid station. Please select from the buttons or type a valid station name."
    
    def _handle_destination_line_selection(self, user_id: str, message: str) -> Union[str, Dict]:
        """Handle destination line selection from quick replies."""
        message_upper = message.upper()
        
        if message_upper in ['MRT-3', 'LRT-1', 'LRT-2']:
            self._set_user_data(user_id, 'selected_destination_line', message_upper)
            self._set_user_state(user_id, ConversationState.WAITING_FOR_DESTINATION_STATION)
            return self._get_line_stations_quick_replies(message_upper, is_origin=False)
        elif message.upper() == 'TYPE_STATION':
            self._set_user_state(user_id, ConversationState.WAITING_FOR_DESTINATION)
            origin = self._get_user_data(user_id, 'origin')
            return f"You're traveling from {origin}. Please type your destination station:"
        else:
            # Handle as regular station input
            return self._handle_destination_input(user_id, message)
    
    def _handle_destination_station_selection(self, user_id: str, message: str) -> Union[str, Dict]:
        """Handle destination station selection from quick replies."""
        if message == 'BACK_TO_LINES':
            origin = self._get_user_data(user_id, 'origin')
            self._set_user_state(user_id, ConversationState.WAITING_FOR_DESTINATION)
            return self._get_destination_selection_options(origin)
        elif message.startswith('MORE_'):
            line = message.replace('MORE_', '')
            return self._get_more_stations_message(line, is_origin=False)
        else:
            # Process as destination
            return self._handle_destination_input(user_id, message)
    
    def _get_more_stations_message(self, line: str, is_origin: bool) -> str:
        """Get message showing all stations for a line."""
        stations = self.station_manager.get_line_stations(line)
        station_type = "origin" if is_origin else "destination"
        
        message = f"🚉 All {line} Stations:\n\n"
        for i, station in enumerate(stations, 1):
            message += f"{i:2d}. {station}\n"
        
        message += f"\n📝 Type your {station_type} station name from the list above."
        return message
    
    def _get_help_message(self) -> str:
        """Get help message with available stations."""
        mrt_stations = ", ".join(self.station_manager.get_line_stations("MRT-3")[:5])  # Show first 5
        lrt1_stations = ", ".join(self.station_manager.get_line_stations("LRT-1")[:5])
        lrt2_stations = ", ".join(self.station_manager.get_line_stations("LRT-2")[:5])
        
        return (
            "🚆 **Available Train Lines & Stations:**\\n\\n"
            f"**MRT-3**: {mrt_stations}... and more\\n"
            f"**LRT-1**: {lrt1_stations}... and more\\n"
            f"**LRT-2**: {lrt2_stations}... and more\\n\\n"
            "💡 **How to use:**\\n"
            "1. Tell me your current station\\n"
            "2. Tell me where you want to go\\n"
            "3. Get real-time train schedules!\\n\\n"
            "Just type your station name to get started!"
        )
    
    def get_user_state(self, user_id: str) -> str:
        """Get current user conversation state."""
        session = self._get_user_session(user_id)
        return session.get('state', ConversationState.INITIAL).value
    
    def clear_user_session(self, user_id: str) -> bool:
        """Public method to clear user session."""
        try:
            self._clear_user_session(user_id)
            return True
        except Exception as e:
            logger.error(f"Error clearing session for {user_id}: {e}")
            return False
    
    def get_stats(self) -> Dict:
        """Get conversation handler statistics."""
        # Clean up expired sessions first
        self._cleanup_expired_sessions()
        
        active_sessions = len(self.user_sessions)
        state_counts = {}
        
        for session in self.user_sessions.values():
            state = session.get('state', ConversationState.INITIAL).value
            state_counts[state] = state_counts.get(state, 0) + 1
        
        return {
            'active_sessions': active_sessions,
            'state_distribution': state_counts,
            'session_timeout_minutes': int(self.session_timeout.total_seconds() / 60),
            'scraper_cache_info': self.rush_scraper.get_cache_info()
        }