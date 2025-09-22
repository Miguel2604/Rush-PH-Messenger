# Rush PH Messenger Bot Implementation Plan

## Project Overview
A Facebook Messenger bot that crawls rush-ph.com to provide train arrival times and ETAs for Philippine train systems (MRT, LRT-1, LRT-2). Users can access train information even with limited data connection by leveraging free Facebook Messenger data.

## Architecture Overview
```
User Message → Facebook Messenger → Webhook (Flask) → Conversation Handler → Web Scraper → Rush-PH.com → Response
```

## Project Structure
```
Rush-PH-Messenger/
├── app.py                 # Main Flask application
├── bot/
│   ├── __init__.py
│   ├── messenger.py       # Messenger API handler
│   └── conversation.py    # Conversation flow logic
├── scraper/
│   ├── __init__.py
│   ├── rush_scraper.py    # Rush-PH scraping logic
│   └── stations.py        # Station data management
├── utils/
│   ├── __init__.py
│   └── helpers.py         # Utility functions
├── requirements.txt
├── Procfile              # For Render deployment
├── .env                  # Environment variables
├── README.md
└── IMPLEMENTATION_PLAN.md
```

## Key Components

### 1. Conversation Flow
- **Step 1**: User sends any message → Bot asks for current station
- **Step 2**: User provides current station → Bot validates & asks for destination
- **Step 3**: User provides destination → Bot scrapes data & responds with schedule

### 2. Web Scraping Strategy
- Extract all station names for validation
- Scrape real-time train schedules based on station pairs
- Handle different train lines (MRT-3, LRT-1, LRT-2, etc.)
- Cache station data to reduce requests

### 3. Facebook Messenger Integration
- Webhook verification for security
- Send/receive message handling
- User session management (store conversation state)
- Rich message formatting

### 4. Error Handling
- Invalid station names (with suggestions)
- Network timeouts
- No train data available
- Rush-PH website downtime

## Technical Stack
- **Backend**: Python Flask
- **Web Scraping**: BeautifulSoup4, Requests
- **Session Management**: In-memory dict (simple) or Redis (scalable)
- **Deployment**: Render
- **API**: Facebook Graph API

## Development Phases

### Phase 1: Project Setup and Environment Configuration
- Initialize Python project with virtual environment
- Create basic project structure with folders
- Setup requirements.txt with initial dependencies
- Configure development environment

### Phase 2: Research and Analyze rush-ph.com Structure
- Inspect website HTML structure
- Identify station data endpoints
- Understand train schedule data format
- Check for JavaScript rendering requirements
- Document scraping strategy

### Phase 3: Build Web Scraper Module
- Create scraper functions for station lists
- Extract train schedule data for each line
- Handle different train lines (MRT, LRT1, LRT2, etc.)
- Implement error handling for network issues
- Add caching mechanisms

### Phase 4: Implement Facebook Messenger Webhook Handler
- Setup Flask app with webhook verification
- Handle incoming messages from Messenger
- Implement basic message sending functionality
- Setup user session management

### Phase 5: Create Conversation Flow Logic
- Implement state management for multi-step conversations
- Add station validation and fuzzy matching
- Integrate scraper with bot responses
- Handle conversation context

### Phase 6: Add Error Handling and User Experience Improvements
- Handle edge cases (invalid stations, network errors)
- Add helpful user guidance messages
- Implement fallback responses
- Add logging and monitoring

### Phase 7: Environment Configuration for Deployment
- Setup environment variables for Facebook app credentials
- Create Procfile for Render deployment
- Configure production settings
- Setup deployment pipeline

### Phase 8: Testing and Deployment
- Test locally with ngrok for webhook testing
- Deploy to Render
- Configure Facebook App webhook URL
- End-to-end testing with real users

## Sample User Interaction
```
User: "Hi"
Bot: "Hello! 👋 What's your current train station?"

User: "Taft Avenue"
Bot: "Got it! Taft Avenue station. Where are you heading?"

User: "Cubao"
Bot: "🚆 LRT-1: Taft Avenue → Cubao
⏰ Next trains:
• 10:05 AM (3 mins)
• 10:12 AM (10 mins)
• 10:19 AM (17 mins)
🕐 Estimated travel time: 25 minutes"
```

## Facebook Messenger Bot Setup Requirements

### Prerequisites
1. Facebook Developer Account
2. Facebook App with Messenger permissions
3. Page Access Token
4. Webhook Verify Token
5. Render account for hosting

### Environment Variables Needed
- `FACEBOOK_PAGE_ACCESS_TOKEN`
- `FACEBOOK_VERIFY_TOKEN` 
- `FACEBOOK_APP_SECRET`
- `PORT` (for Render deployment)

## Dependencies (requirements.txt)
```
Flask==2.3.3
requests==2.31.0
beautifulsoup4==4.12.2
python-dotenv==1.0.0
gunicorn==21.2.0
```

## Deployment Configuration (Procfile)
```
web: gunicorn app:app
```

## Success Metrics
- Bot responds within 5 seconds
- Accurate train schedule information
- Handles 95% of valid station pairs
- Graceful error handling for edge cases
- Successful deployment on Render

## Future Enhancements
- Support for bus routes
- Real-time traffic updates
- Push notifications for delays
- Multiple language support (Filipino, English)
- Integration with other transportation apps

---

**Next Steps**: Start with Phase 1 - Project Setup and Environment Configuration