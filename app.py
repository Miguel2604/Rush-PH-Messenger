"""
Rush PH Messenger Bot - Main Flask Application
Facebook Messenger webhook handler for train schedule bot.
"""
import os
import logging
from flask import Flask, request, jsonify
from dotenv import load_dotenv

from bot.messenger import MessengerBot
from utils.helpers import verify_webhook_signature, validate_facebook_request

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Configuration
FACEBOOK_VERIFY_TOKEN = os.getenv('FACEBOOK_VERIFY_TOKEN')
FACEBOOK_PAGE_ACCESS_TOKEN = os.getenv('FACEBOOK_PAGE_ACCESS_TOKEN')
FACEBOOK_APP_SECRET = os.getenv('FACEBOOK_APP_SECRET')
PORT = int(os.getenv('PORT', 5000))

# Validate required environment variables
required_vars = ['FACEBOOK_VERIFY_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_APP_SECRET']
missing_vars = [var for var in required_vars if not os.getenv(var)]

if missing_vars:
    logger.error(f"Missing required environment variables: {', '.join(missing_vars)}")
    logger.error("Please check your .env file and ensure all Facebook credentials are set")
    exit(1)

# Initialize MessengerBot
messenger_bot = MessengerBot(
    page_access_token=FACEBOOK_PAGE_ACCESS_TOKEN,
    app_secret=FACEBOOK_APP_SECRET
)

@app.route('/', methods=['GET'])
def home():
    """Home page endpoint."""
    return jsonify({
        'status': 'success',
        'message': 'Rush PH Messenger Bot is running!',
        'version': '1.0.0'
    })

@app.route('/webhook', methods=['GET'])
def webhook_verification():
    """
    Handle Facebook webhook verification.
    Facebook will make a GET request to verify the webhook endpoint.
    """
    try:
        # Facebook sends these parameters for verification
        mode = request.args.get('hub.mode')
        token = request.args.get('hub.verify_token')
        challenge = request.args.get('hub.challenge')
        
        # Log the verification attempt
        logger.info(f"Webhook verification attempt - mode: {mode}, token present: {token is not None}")
        
        # Check if mode and token are valid
        if mode == 'subscribe' and token == FACEBOOK_VERIFY_TOKEN:
            logger.info("Webhook verification successful")
            return challenge
        else:
            logger.warning("Webhook verification failed - invalid token or mode")
            return 'Verification failed', 403
            
    except Exception as e:
        logger.error(f"Error during webhook verification: {e}")
        return 'Verification error', 500

@app.route('/webhook', methods=['POST'])
def webhook_handler():
    """
    Handle incoming Facebook Messenger messages.
    This endpoint receives POST requests from Facebook when users send messages.
    """
    try:
        # Get the raw request data
        raw_data = request.get_data(as_text=True)
        
        # Verify webhook signature for security
        signature = request.headers.get('X-Hub-Signature-256')
        if not verify_webhook_signature(raw_data, signature, FACEBOOK_APP_SECRET):
            logger.warning("Invalid webhook signature")
            return 'Unauthorized', 401
        
        # Parse JSON data
        data = request.get_json()
        
        if not data:
            logger.warning("No JSON data received")
            return 'No data', 400
        
        # Validate Facebook request format
        if not validate_facebook_request(data):
            logger.warning("Invalid Facebook request format")
            return 'Invalid request format', 400
        
        # Log incoming request (for debugging)
        logger.info(f"Received webhook data: {data}")
        
        # Process the message with MessengerBot
        messenger_bot.process_message(data)
        
        return 'OK', 200
        
    except Exception as e:
        logger.error(f"Error processing webhook: {e}", exc_info=True)
        return 'Internal server error', 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for monitoring."""
    try:
        # Basic health check
        health_status = {
            'status': 'healthy',
            'timestamp': messenger_bot.get_current_timestamp(),
            'bot_initialized': messenger_bot is not None,
            'environment_vars_loaded': all([
                FACEBOOK_VERIFY_TOKEN,
                FACEBOOK_PAGE_ACCESS_TOKEN,
                FACEBOOK_APP_SECRET
            ])
        }
        
        return jsonify(health_status)
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 500

@app.route('/stats', methods=['GET'])
def get_stats():
    """Get bot statistics and cache information."""
    try:
        stats = messenger_bot.get_bot_stats()
        return jsonify(stats)
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        return jsonify({'error': 'Unable to get stats'}), 500

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    logger.error(f"Internal server error: {error}")
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Development server
    logger.info(f"Starting Rush PH Messenger Bot on port {PORT}")
    logger.info("Bot is ready to receive messages!")
    
    # Run Flask development server
    app.run(
        host='0.0.0.0',
        port=PORT,
        debug=os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    )