/**
 * Rush PH Messenger Bot - Main Express Application
 * Facebook Messenger webhook handler for train schedule bot.
 */

require('dotenv').config();
const express = require('express');
const MessengerBot = require('./src/bot/messenger');
const { verifyWebhookSignature, validateFacebookRequest } = require('./src/utils/helpers');

// Configure logging
const app = express();

// Configuration
const FACEBOOK_VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN;
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const PORT = parseInt(process.env.PORT, 10) || 5000;

// Validate required environment variables
const requiredVars = ['FACEBOOK_VERIFY_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_APP_SECRET'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please check your .env file and ensure all Facebook credentials are set');
    process.exit(1);
}

// Initialize MessengerBot
const messengerBot = new MessengerBot(FACEBOOK_PAGE_ACCESS_TOKEN, FACEBOOK_APP_SECRET);

// Middleware to parse raw body for signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));

// Parse JSON for other routes
app.use(express.json());

/**
 * Home page endpoint.
 */
app.get('/', (req, res) => {
    res.json({
        status: 'success',
        message: 'Rush PH Messenger Bot is running!',
        version: '1.0.0'
    });
});

/**
 * Handle Facebook webhook verification.
 * Facebook will make a GET request to verify the webhook endpoint.
 */
app.get('/webhook', (req, res) => {
    try {
        // Facebook sends these parameters for verification
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        // Log the verification attempt
        console.log(`Webhook verification attempt - mode: ${mode}, token present: ${token !== undefined}`);

        // Check if mode and token are valid
        if (mode === 'subscribe' && token === FACEBOOK_VERIFY_TOKEN) {
            console.log('Webhook verification successful');
            return res.status(200).send(challenge);
        } else {
            console.warn('Webhook verification failed - invalid token or mode');
            return res.status(403).send('Verification failed');
        }
    } catch (error) {
        console.error('Error during webhook verification:', error);
        return res.status(500).send('Verification error');
    }
});

/**
 * Handle incoming Facebook Messenger messages.
 * This endpoint receives POST requests from Facebook when users send messages.
 */
app.post('/webhook', async (req, res) => {
    try {
        // Get the raw request data
        const rawData = req.body;
        const rawDataString = rawData.toString('utf8');

        // Verify webhook signature for security
        const signature = req.headers['x-hub-signature-256'];
        if (!verifyWebhookSignature(rawDataString, signature, FACEBOOK_APP_SECRET)) {
            console.warn('Invalid webhook signature');
            return res.status(401).send('Unauthorized');
        }

        // Parse JSON data
        let data;
        try {
            data = JSON.parse(rawDataString);
        } catch (parseError) {
            console.warn('No JSON data received');
            return res.status(400).send('No data');
        }

        // Validate Facebook request format
        if (!validateFacebookRequest(data)) {
            console.warn('Invalid Facebook request format');
            return res.status(400).send('Invalid request format');
        }

        // Log incoming request (for debugging)
        console.log('Received webhook data:', JSON.stringify(data, null, 2));

        // Process the message with MessengerBot
        await messengerBot.processMessage(data);

        return res.status(200).send('OK');
    } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).send('Internal server error');
    }
});

/**
 * Health check endpoint for monitoring.
 */
app.get('/health', (req, res) => {
    try {
        // Basic health check
        const healthStatus = {
            status: 'healthy',
            timestamp: messengerBot.getCurrentTimestamp(),
            botInitialized: messengerBot !== null,
            environmentVarsLoaded: [
                FACEBOOK_VERIFY_TOKEN,
                FACEBOOK_PAGE_ACCESS_TOKEN,
                FACEBOOK_APP_SECRET
            ].every(Boolean)
        };

        return res.json(healthStatus);
    } catch (error) {
        console.error('Health check failed:', error);
        return res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

/**
 * Get bot statistics and cache information.
 */
app.get('/stats', (req, res) => {
    try {
        const stats = messengerBot.getBotStats();
        return res.json(stats);
    } catch (error) {
        console.error('Error getting stats:', error);
        return res.status(500).json({ error: 'Unable to get stats' });
    }
});

/**
 * Handle 404 errors.
 */
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

/**
 * Handle 500 errors.
 */
app.use((error, req, res, next) => {
    console.error('Internal server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start the server
if (require.main === module) {
    // Only start the server if this file is run directly
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Starting Rush PH Messenger Bot on port ${PORT}`);
        console.log('Bot is ready to receive messages!');
    });
}

module.exports = app;