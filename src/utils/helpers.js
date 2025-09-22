/**
 * Utility functions for the Rush PH Messenger Bot.
 */

const crypto = require('crypto');

/**
 * Verify Facebook webhook signature for security.
 * @param {string} payload - The raw request payload
 * @param {string} signature - The X-Hub-Signature-256 header value
 * @param {string} appSecret - Facebook app secret
 * @returns {boolean} True if signature is valid, false otherwise
 */
function verifyWebhookSignature(payload, signature, appSecret) {
    if (!signature || !signature.startsWith('sha256=')) {
        return false;
    }

    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(payload, 'utf8')
        .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

/**
 * Format train schedule data into a user-friendly message.
 * @param {object} scheduleData - Dictionary containing train schedule information
 * @returns {string} Formatted message string
 */
function formatTrainScheduleMessage(scheduleData) {
    if (!scheduleData) {
        return "❌ Sorry, I couldn't get train schedule information right now. Please try again later.";
    }

    const line = scheduleData.line || 'Unknown Line';
    const origin = scheduleData.origin || 'Unknown';
    const destination = scheduleData.destination || 'Unknown';
    const trains = scheduleData.nextTrains || [];
    const travelTime = scheduleData.estimatedTravelTime || 'Unknown';
    const isSimulated = scheduleData.simulated || false;

    // Build the message
    let message = `🚆 ${line}: ${origin} → ${destination}\n\n`;

    if (trains.length > 0) {
        message += "⏰ Next trains:\n";
        for (let i = 0; i < Math.min(trains.length, 3); i++) {
            const train = trains[i];
            const timeStr = train.time || 'Unknown';
            const minutes = train.minutesAway || 0;
            const status = train.status || 'Unknown';

            let timeDesc;
            if (minutes <= 1) {
                timeDesc = "Now";
            } else if (minutes <= 5) {
                timeDesc = `${minutes} min`;
            } else {
                timeDesc = `${minutes} mins`;
            }

            const statusEmoji = status === "On Time" ? "🟢" : (status === "Delayed" ? "🟡" : "⚫");
            message += `• ${timeStr} (${timeDesc}) ${statusEmoji}\n`;
        }
    } else {
        message += "❌ No train schedule available\n";
    }

    message += `\n🕐 Estimated travel time: ${travelTime} minutes`;

    if (isSimulated) {
        message += "\n\n📝 *Note: This is simulated data for demonstration purposes*";
    }

    return message;
}

/**
 * Format station suggestions into a user-friendly message.
 * @param {string[]} suggestions - List of suggested station names
 * @param {string} originalInput - Original user input
 * @returns {string} Formatted suggestions message
 */
function formatStationSuggestions(suggestions, originalInput) {
    if (!suggestions || suggestions.length === 0) {
        return `❌ Sorry, I couldn't find a station matching '${originalInput}'. Please check the spelling and try again.`;
    }

    let message = `🤔 I couldn't find '${originalInput}' exactly. Did you mean:\n\n`;

    for (let i = 0; i < suggestions.length; i++) {
        message += `${i + 1}. ${suggestions[i]}\n`;
    }

    message += "\nPlease type the correct station name or choose from the suggestions above.";

    return message;
}

/**
 * Clean and normalize user input.
 * @param {string} text - Raw user input text
 * @returns {string} Cleaned text
 */
function cleanUserInput(text) {
    if (!text) {
        return "";
    }

    // Remove extra whitespace and normalize
    let cleanedText = text.trim();
    cleanedText = cleanedText.replace(/\s+/g, ' '); // Replace multiple spaces with single space

    // Remove special characters but preserve hyphens, dots, and underscores for station/line names
    cleanedText = cleanedText.replace(/[^a-zA-Z0-9\s\-\._]/g, '');

    return cleanedText;
}

/**
 * Check if user input is a greeting.
 * @param {string} text - User input text
 * @returns {boolean} True if input appears to be a greeting
 */
function isGreeting(text) {
    const greetings = [
        'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
        'kumusta', 'kamusta', 'start', 'begin', 'help', 'aloha', 'yo', 'sup'
    ];

    const textLower = text.toLowerCase().trim();

    return greetings.some(greeting => textLower.includes(greeting));
}

/**
 * Get appropriate error message based on error type.
 * @param {string} errorType - Type of error
 * @returns {string} User-friendly error message
 */
function getErrorMessage(errorType) {
    const errorMessages = {
        'network': "🔌 I'm having trouble connecting to the train schedule service. Please try again in a few moments.",
        'invalid_station': "❌ I couldn't find that station. Please make sure you've entered a valid train station name.",
        'same_station': "🤔 You've entered the same station for both origin and destination. Please choose different stations.",
        'no_data': "📭 No train schedule data is available for this route right now. Please try again later.",
        'server_error': "⚠️ I'm experiencing technical difficulties. Please try again later.",
        'timeout': "⏱️ The request is taking too long. Please try again."
    };

    return errorMessages[errorType] || "❌ Something went wrong. Please try again.";
}

/**
 * Validate that the request is from Facebook Messenger.
 * @param {object} data - Request data object
 * @returns {boolean} True if request is valid Facebook Messenger format
 */
function validateFacebookRequest(data) {
    try {
        // Check basic structure
        if (!data.object || !data.entry) {
            return false;
        }

        if (data.object !== 'page') {
            return false;
        }

        // Check entry structure
        const entries = data.entry || [];
        if (entries.length === 0) {
            return false;
        }

        for (const entry of entries) {
            if (!entry.messaging) {
                continue;
            }

            const messagingEvents = entry.messaging || [];
            for (const event of messagingEvents) {
                if (event.sender && event.recipient) {
                    return true;
                }
            }
        }

        return false;
    } catch (error) {
        return false;
    }
}

/**
 * Extract text message from Facebook Messenger event.
 * @param {object} messagingEvent - Messenger event object
 * @returns {string|null} Extracted message text or null
 */
function extractMessageText(messagingEvent) {
    try {
        const message = messagingEvent.message || {};
        return message.text || null;
    } catch (error) {
        return null;
    }
}

/**
 * Extract sender ID from Facebook Messenger event.
 * @param {object} messagingEvent - Messenger event object
 * @returns {string|null} Sender ID or null
 */
function getSenderId(messagingEvent) {
    try {
        const sender = messagingEvent.sender || {};
        return sender.id || null;
    } catch (error) {
        return null;
    }
}

/**
 * Log user interactions for debugging and analytics.
 * @param {string} userId - User identifier
 * @param {string} message - User message
 * @param {string} response - Bot response
 * @param {string} conversationState - Current conversation state
 */
function logInteraction(userId, message, response, conversationState) {
    const timestamp = new Date().toISOString();

    // In a production environment, you would log to a proper logging service
    // For now, we'll just print to console
    console.log(`[${timestamp}] User ${userId} (${conversationState}): ${message}`);
    console.log(`[${timestamp}] Bot response: ${response}`);
}

/**
 * Get the welcome message for new users.
 * @returns {string} Welcome message
 */
function formatWelcomeMessage() {
    return (
        "🚆 Welcome to Rush PH Bot! 👋\n\n" +
        "I can help you get real-time train arrival times for MRT, LRT-1, and LRT-2.\n\n" +
        "Just tell me your current train station to get started!"
    );
}

module.exports = {
    verifyWebhookSignature,
    formatTrainScheduleMessage,
    formatStationSuggestions,
    cleanUserInput,
    isGreeting,
    getErrorMessage,
    validateFacebookRequest,
    extractMessageText,
    getSenderId,
    logInteraction,
    formatWelcomeMessage
};