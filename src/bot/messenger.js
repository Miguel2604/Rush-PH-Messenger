/**
 * Facebook Messenger API handler for the Rush PH Bot.
 */

const axios = require('axios');
const ConversationHandler = require('./conversation');
const {
    extractMessageText,
    getSenderId,
    logInteraction
} = require('../utils/helpers');

class MessengerBot {
    /**
     * Initialize the Messenger bot.
     * @param {string} pageAccessToken - Facebook page access token
     * @param {string} appSecret - Facebook app secret
     */
    constructor(pageAccessToken, appSecret) {
        this.pageAccessToken = pageAccessToken;
        this.appSecret = appSecret;
        this.graphUrl = 'https://graph.facebook.com/v18.0/me/messages';
        
        // Initialize conversation handler
        this.conversationHandler = new ConversationHandler();
        
        // Bot statistics
        this.stats = {
            messagesReceived: 0,
            messagesSent: 0,
            uniqueUsers: new Set(),
            startTime: new Date(),
            lastActivity: null
        };
        
        console.log('MessengerBot initialized successfully');
    }

    /**
     * Send a text message to a user via Facebook Messenger.
     * @param {string} recipientId - Facebook user ID to send message to
     * @param {string} messageText - Text content of the message
     * @returns {Promise<boolean>} True if message sent successfully, false otherwise
     */
    async sendMessage(recipientId, messageText) {
        try {
            // Prepare the message payload
            const messageData = {
                recipient: { id: recipientId },
                message: { text: messageText }
            };

            // Set up request headers
            const headers = {
                'Content-Type': 'application/json'
            };

            // Set up request parameters
            const params = {
                access_token: this.pageAccessToken
            };

            // Send the message
            const response = await axios.post(this.graphUrl, messageData, {
                headers: headers,
                params: params,
                timeout: 10000
            });

            if (response.status === 200) {
                console.log(`Message sent successfully to user ${recipientId}`);
                this.stats.messagesSent++;
                return true;
            } else {
                console.error(`Failed to send message. Status: ${response.status}, Response: ${response.data}`);
                return false;
            }
        } catch (error) {
            console.error(`Error sending message to ${recipientId}:`, error.message);
            return false;
        }
    }

    /**
     * Send typing indicator to show bot is processing.
     * @param {string} recipientId - Facebook user ID
     * @returns {Promise<boolean>} True if indicator sent successfully
     */
    async sendTypingIndicator(recipientId) {
        try {
            const messageData = {
                recipient: { id: recipientId },
                sender_action: 'typing_on'
            };

            const headers = { 'Content-Type': 'application/json' };
            const params = { access_token: this.pageAccessToken };

            const response = await axios.post(this.graphUrl, messageData, {
                headers: headers,
                params: params,
                timeout: 5000
            });

            return response.status === 200;
        } catch (error) {
            console.debug('Error sending typing indicator:', error.message);
            return false;
        }
    }

    /**
     * Send a message with quick reply buttons.
     * @param {string} recipientId - Facebook user ID
     * @param {string} messageText - Main message text
     * @param {Array} quickReplies - List of quick reply options
     * @returns {Promise<boolean>} True if sent successfully
     */
    async sendQuickReplies(recipientId, messageText, quickReplies) {
        try {
            const messageData = {
                recipient: { id: recipientId },
                message: {
                    text: messageText,
                    quick_replies: quickReplies
                }
            };

            const headers = { 'Content-Type': 'application/json' };
            const params = { access_token: this.pageAccessToken };

            const response = await axios.post(this.graphUrl, messageData, {
                headers: headers,
                params: params,
                timeout: 10000
            });

            if (response.status === 200) {
                console.log(`Quick replies sent successfully to user ${recipientId}`);
                this.stats.messagesSent++;
                return true;
            } else {
                console.error(`Failed to send quick replies. Status: ${response.status}`);
                return false;
            }
        } catch (error) {
            console.error(`Error sending quick replies to ${recipientId}:`, error.message);
            return false;
        }
    }

    /**
     * Process incoming webhook message from Facebook.
     * @param {object} webhookData - Webhook data from Facebook
     */
    async processMessage(webhookData) {
        try {
            // Update last activity
            this.stats.lastActivity = new Date();

            // Extract messaging events
            const entries = webhookData.entry || [];

            for (const entry of entries) {
                const messagingEvents = entry.messaging || [];

                for (const event of messagingEvents) {
                    await this._handleMessagingEvent(event);
                }
            }
        } catch (error) {
            console.error('Error processing webhook message:', error);
        }
    }

    /**
     * Handle a single messaging event.
     * @param {object} event - Single messaging event from Facebook
     */
    async _handleMessagingEvent(event) {
        try {
            // Extract sender ID and message text
            const senderId = getSenderId(event);
            const messageText = extractMessageText(event);

            if (!senderId) {
                console.warn('Could not extract sender ID from event');
                return;
            }

            // Track unique users
            this.stats.uniqueUsers.add(senderId);
            this.stats.messagesReceived++;

            // Skip if no message text (could be attachment, etc.)
            if (!messageText) {
                console.debug(`No text message from user ${senderId}`);
                return;
            }

            console.log(`Processing message from ${senderId}: ${messageText}`);

            // Send typing indicator
            await this.sendTypingIndicator(senderId);

            // Process the message through conversation handler
            const response = await this.conversationHandler.handleMessage(senderId, messageText);

            if (response) {
                let success = false;

                // Check if response includes quick replies
                if (typeof response === 'object' && response.quick_replies) {
                    const messageText = response.text || '';
                    const quickReplies = response.quick_replies || [];

                    if (quickReplies.length > 0) {
                        success = await this.sendQuickReplies(senderId, messageText, quickReplies);
                    } else {
                        success = await this.sendMessage(senderId, messageText);
                    }
                } else {
                    // Simple text response
                    success = await this.sendMessage(senderId, response);
                }

                if (success) {
                    // Log the interaction
                    const conversationState = this.conversationHandler.getUserState(senderId);
                    logInteraction(senderId, messageText, String(response), conversationState);
                } else {
                    console.error(`Failed to send response to user ${senderId}`);
                }
            } else {
                console.warn(`No response generated for user ${senderId}`);
            }
        } catch (error) {
            console.error('Error handling messaging event:', error);

            // Send error message to user
            try {
                const errorMsg = "❌ I'm having some technical difficulties. Please try again in a moment.";
                await this.sendMessage(getSenderId(event), errorMsg);
            } catch {
                // Don't let error handling errors crash the bot
            }
        }
    }

    /**
     * Get user profile information from Facebook.
     * @param {string} userId - Facebook user ID
     * @returns {Promise<object|null>} User profile data or null if failed
     */
    async getUserProfile(userId) {
        try {
            const url = `https://graph.facebook.com/v18.0/${userId}`;
            const params = {
                fields: 'first_name,last_name,profile_pic',
                access_token: this.pageAccessToken
            };

            const response = await axios.get(url, { params, timeout: 5000 });

            if (response.status === 200) {
                return response.data;
            } else {
                console.warn(`Could not get user profile for ${userId}`);
                return null;
            }
        } catch (error) {
            console.error(`Error getting user profile for ${userId}:`, error.message);
            return null;
        }
    }

    /**
     * Get current timestamp in ISO format.
     * @returns {string} Current timestamp
     */
    getCurrentTimestamp() {
        return new Date().toISOString();
    }

    /**
     * Get bot statistics and performance data.
     * @returns {object} Bot statistics
     */
    getBotStats() {
        const uptime = new Date().getTime() - this.stats.startTime.getTime();

        return {
            botStatus: 'active',
            uptimeSeconds: Math.floor(uptime / 1000),
            messagesReceived: this.stats.messagesReceived,
            messagesSent: this.stats.messagesSent,
            uniqueUsers: this.stats.uniqueUsers.size,
            lastActivity: this.stats.lastActivity ? this.stats.lastActivity.toISOString() : null,
            startTime: this.stats.startTime.toISOString(),
            conversationHandlerStats: this.conversationHandler.getStats(),
            currentTime: this.getCurrentTimestamp()
        };
    }

    /**
     * Clear conversation data for a specific user.
     * @param {string} userId - Facebook user ID
     * @returns {boolean} True if cleared successfully
     */
    clearUserData(userId) {
        try {
            return this.conversationHandler.clearUserSession(userId);
        } catch (error) {
            console.error(`Error clearing user data for ${userId}:`, error);
            return false;
        }
    }

    /**
     * Send a broadcast message to multiple users.
     * @param {string} messageText - Message to broadcast
     * @param {Array<string>} userList - Optional list of user IDs. If null, broadcasts to all known users.
     * @returns {Promise<object>} Broadcast results
     */
    async broadcastMessage(messageText, userList = null) {
        if (userList === null) {
            userList = Array.from(this.stats.uniqueUsers);
        }

        const results = {
            totalUsers: userList.length,
            successfulSends: 0,
            failedSends: 0,
            errors: []
        };

        for (const userId of userList) {
            try {
                const success = await this.sendMessage(userId, messageText);
                if (success) {
                    results.successfulSends++;
                } else {
                    results.failedSends++;
                }
            } catch (error) {
                results.failedSends++;
                results.errors.push(`User ${userId}: ${error.message}`);
            }
        }

        console.log(`Broadcast completed: ${results.successfulSends}/${results.totalUsers} successful`);
        return results;
    }
}

module.exports = MessengerBot;