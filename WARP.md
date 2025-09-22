# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Rush PH Messenger is a Facebook Messenger bot that provides real-time train arrival times and ETAs for Philippine train systems (MRT, LRT-1, LRT-2) by scraping data from rush-ph.com. The project addresses the challenge of accessing transportation data with limited data connectivity in the Philippines, leveraging free Facebook Messenger data plans.

## Development Status

**Current State**: Early development phase - repository contains planning documents but implementation hasn't started yet.
- See `IMPLEMENTATION_PLAN.md` for detailed development roadmap and architecture
- Project structure and technical stack are defined but source code is pending

## Architecture Overview

The system follows this flow:
```
User Message → Facebook Messenger → Webhook (Flask) → Conversation Handler → Web Scraper → Rush-PH.com → Response
```

**Key Components** (planned):
- **Flask Web Application**: Main webhook handler (`app.py`)
- **Messenger Integration**: Facebook Messenger API handling (`bot/messenger.py`)
- **Conversation Engine**: Multi-step conversation flow logic (`bot/conversation.py`)
- **Web Scraper**: Rush-PH.com data extraction (`scraper/rush_scraper.py`)
- **Station Data**: Station management and validation (`scraper/stations.py`)

## Tech Stack

- **Backend**: Python 3.8+ with Flask
- **Web Scraping**: BeautifulSoup4, Requests
- **Messaging**: Facebook Messenger API/Graph API
- **Deployment**: Render
- **Data Source**: rush-ph.com

## Development Commands

### Environment Setup
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your Facebook app credentials
```

### Running the Application
```bash
# Run Flask development server
python app.py

# For production deployment
gunicorn app:app
```

### Development Workflow
```bash
# Check Python version compatibility
python --version  # Should be 3.8+

# Install new dependencies and update requirements
pip install <package>
pip freeze > requirements.txt

# Test webhook with ngrok (for local development)
ngrok http 5000
```

## Environment Configuration

Required environment variables (see `.env.example`):
- `FACEBOOK_PAGE_ACCESS_TOKEN`: Facebook page access token
- `FACEBOOK_VERIFY_TOKEN`: Webhook verification token  
- `FACEBOOK_APP_SECRET`: Facebook app secret
- `PORT`: Application port (default: 5000)
- `FLASK_ENV`: Environment mode (development/production)
- `FLASK_DEBUG`: Debug mode toggle

## Project Structure (Planned)

```
Rush-PH-Messenger/
├── app.py                 # Main Flask application entry point
├── bot/
│   ├── __init__.py
│   ├── messenger.py       # Facebook Messenger API handler
│   └── conversation.py    # Multi-step conversation flow logic
├── scraper/
│   ├── __init__.py
│   ├── rush_scraper.py    # Rush-PH.com web scraping logic
│   └── stations.py        # Station data management & validation
├── utils/
│   ├── __init__.py
│   └── helpers.py         # Utility functions
├── requirements.txt       # Python dependencies
├── Procfile              # Render deployment configuration
└── .env                  # Environment variables (not in git)
```

## Conversation Flow Logic

The bot implements a 3-step conversational interface:
1. **Greeting**: User sends any message → Bot asks for current station
2. **Origin**: User provides current station → Bot validates & asks for destination  
3. **Destination**: User provides destination → Bot scrapes rush-ph.com & responds with train schedules

## Data Integration

- **Primary Data Source**: rush-ph.com
- **Scraping Strategy**: Extract station names for validation, real-time schedules for station pairs
- **Train Lines Supported**: MRT-3, LRT-1, LRT-2
- **Caching**: Station data caching to reduce external requests

## Error Handling Requirements

- Invalid station names with suggestions
- Network timeout handling  
- No train data available scenarios
- Rush-PH website downtime fallbacks
- Graceful conversation state recovery

## Deployment

**Target Platform**: Render
**Production Configuration**:
- Uses Gunicorn WSGI server
- Requires Procfile: `web: gunicorn app:app`
- Facebook webhook URL configuration required
- HTTPS endpoint needed for Messenger webhook

## Testing Approach

**Local Development**:
- Use ngrok to expose local Flask server for webhook testing
- Test with real Facebook Messenger integration

**Production Testing**:
- End-to-end testing with Facebook Messenger
- Validate against multiple train stations and routes
- Performance testing (target: <5 second response time)