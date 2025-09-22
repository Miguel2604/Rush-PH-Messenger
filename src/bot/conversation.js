/**
 * Conversation handler for the Rush PH Messenger Bot.
 * Manages multi-step conversation flow for train schedule queries.
 */

const StationManager = require('../scraper/stations');
const PlaywrightRushScraper = require('../scraper/playwright-rush-scraper');
const {
    cleanUserInput,
    isGreeting,
    formatTrainScheduleMessage,
    formatStationSuggestions,
    formatWelcomeMessage,
    getErrorMessage
} = require('../utils/helpers');

// Conversation states
const ConversationState = {
    INITIAL: 'initial',
    WAITING_FOR_ORIGIN: 'waiting_for_origin',
    WAITING_FOR_ORIGIN_LINE: 'waiting_for_origin_line',
    WAITING_FOR_ORIGIN_STATION: 'waiting_for_origin_station',
    WAITING_FOR_DESTINATION: 'waiting_for_destination',
    WAITING_FOR_DESTINATION_LINE: 'waiting_for_destination_line',
    WAITING_FOR_DESTINATION_STATION: 'waiting_for_destination_station',
    COMPLETED: 'completed'
};

class ConversationHandler {
    /**
     * Initialize the conversation handler.
     */
    constructor() {
        this.stationManager = new StationManager();
        this.rushScraper = new PlaywrightRushScraper({ useBrowser: true });
        this.userSessions = new Map(); // In-memory user sessions
        
        // Session timeout (1 hour)
        this.sessionTimeout = 60 * 60 * 1000; // 1 hour in milliseconds
        
        console.log('ConversationHandler initialized');
    }

    /**
     * Handle incoming message and return appropriate response.
     * @param {string} userId - User identifier
     * @param {string} message - User message text
     * @returns {Promise<string|object>} Response message or structured response with quick replies
     */
    async handleMessage(userId, message) {
        try {
            // Clean the user input
            const cleanedMessage = cleanUserInput(message);
            
            if (!cleanedMessage) {
                return getErrorMessage('invalid_station');
            }

            // Get or create user session
            const session = this._getUserSession(userId);
            const currentState = session.state || ConversationState.INITIAL;

            // Log the conversation state
            console.log(`User ${userId} in state ${currentState}: ${cleanedMessage}`);

            // Handle message based on current state
            switch (currentState) {
                case ConversationState.INITIAL:
                    return await this._handleInitialState(userId, cleanedMessage);
                case ConversationState.WAITING_FOR_ORIGIN:
                    return await this._handleOriginInput(userId, cleanedMessage);
                case ConversationState.WAITING_FOR_ORIGIN_LINE:
                    return await this._handleOriginLineSelection(userId, cleanedMessage);
                case ConversationState.WAITING_FOR_ORIGIN_STATION:
                    return await this._handleOriginStationSelection(userId, cleanedMessage);
                case ConversationState.WAITING_FOR_DESTINATION:
                    return await this._handleDestinationInput(userId, cleanedMessage);
                case ConversationState.WAITING_FOR_DESTINATION_LINE:
                    return await this._handleDestinationLineSelection(userId, cleanedMessage);
                case ConversationState.WAITING_FOR_DESTINATION_STATION:
                    return await this._handleDestinationStationSelection(userId, cleanedMessage);
                case ConversationState.COMPLETED:
                    // User is starting a new conversation after completion
                    this._setUserState(userId, ConversationState.INITIAL);
                    return await this._handleInitialState(userId, cleanedMessage);
                default:
                    // Reset to initial state if in unknown state
                    this._setUserState(userId, ConversationState.INITIAL);
                    return await this._handleInitialState(userId, cleanedMessage);
            }
        } catch (error) {
            console.error(`Error handling message from ${userId}:`, error);
            return getErrorMessage('server_error');
        }
    }

    /**
     * Handle messages when user is in initial state.
     * @param {string} userId - User identifier
     * @param {string} message - User message
     * @returns {Promise<string|object>} Response message or structured response with quick replies
     */
    async _handleInitialState(userId, message) {
        // Check if it's a greeting or if user is starting fresh
        if (isGreeting(message) || ['start', 'begin', 'restart'].includes(message.toLowerCase())) {
            this._setUserState(userId, ConversationState.WAITING_FOR_ORIGIN);
            return this._getOriginSelectionOptions();
        }

        // User might have directly provided a station name
        const validatedStation = this.stationManager.validateStation(message);
        
        if (validatedStation) {
            // Valid station provided directly
            this._setUserData(userId, 'origin', validatedStation);
            this._setUserState(userId, ConversationState.WAITING_FOR_DESTINATION);
            
            return this._getDestinationSelectionOptions(validatedStation);
        } else {
            // Invalid station, provide suggestions
            const suggestions = this.stationManager.getStationSuggestions(message);
            if (suggestions.length > 0) {
                // Set state to waiting for origin and show suggestions
                this._setUserState(userId, ConversationState.WAITING_FOR_ORIGIN);
                return formatStationSuggestions(suggestions, message);
            } else {
                // No suggestions found
                this._setUserState(userId, ConversationState.WAITING_FOR_ORIGIN);
                return `🤔 I couldn't find a station matching '${message}'. ` +
                       "Please check the spelling and try again, or type 'help' to see available stations.";
            }
        }
    }

    /**
     * Get origin selection with quick reply options.
     * @returns {object} Structured response with quick replies
     */
    _getOriginSelectionOptions() {
        const quickReplies = [
            { content_type: 'text', title: '🚇 MRT-3', payload: 'MRT-3' },
            { content_type: 'text', title: '🚅 LRT-1', payload: 'LRT-1' },
            { content_type: 'text', title: '🚆 LRT-2', payload: 'LRT-2' },
            { content_type: 'text', title: '✍️ Type Station', payload: 'TYPE_STATION' }
        ];

        return {
            text: formatWelcomeMessage() + 
                  "\n\n🛤️ Choose your train line to see stations, or type your current station:",
            quick_replies: quickReplies
        };
    }

    /**
     * Get destination selection with quick reply options.
     * @param {string} originStation - Origin station name
     * @returns {object} Structured response with quick replies
     */
    _getDestinationSelectionOptions(originStation) {
        const quickReplies = [
            { content_type: 'text', title: '🚇 MRT-3', payload: 'MRT-3' },
            { content_type: 'text', title: '🚅 LRT-1', payload: 'LRT-1' },
            { content_type: 'text', title: '🚆 LRT-2', payload: 'LRT-2' },
            { content_type: 'text', title: '✍️ Type Station', payload: 'TYPE_STATION' }
        ];

        return {
            text: `Perfect! You're at ${originStation}. \n\n🛤️ Choose destination train line or type station name:`,
            quick_replies: quickReplies
        };
    }

    /**
     * Get station quick replies for a specific line.
     * @param {string} line - Train line name
     * @param {boolean} isOrigin - True if selecting origin, false for destination
     * @returns {object} Structured response with quick replies
     */
    _getLineStationsQuickReplies(line, isOrigin = true) {
        const stations = this.stationManager.getLineStations(line);
        const quickReplies = [];

        // Add up to 10 stations as quick replies (Facebook limit is 13)
        for (let i = 0; i < Math.min(stations.length, 10); i++) {
            quickReplies.push({
                content_type: 'text',
                title: stations[i],
                payload: stations[i]
            });
        }

        // Add "More stations" option if there are more than 10
        if (stations.length > 10) {
            quickReplies.push({
                content_type: 'text',
                title: '📜 More stations',
                payload: `MORE_${line}`
            });
        }

        // Add back option
        quickReplies.push({
            content_type: 'text',
            title: '← Back to Lines',
            payload: 'BACK_TO_LINES'
        });

        const stationType = isOrigin ? "origin" : "destination";
        let message = `🚉 ${line} Stations - Select your ${stationType}:`;

        if (stations.length > 10) {
            message += `\n\n📝 Showing first 10 of ${stations.length} stations. Tap 'More stations' or type station name.`;
        }

        return {
            text: message,
            quick_replies: quickReplies
        };
    }

    /**
     * Handle origin station input.
     * @param {string} userId - User identifier
     * @param {string} message - User message
     * @returns {Promise<string|object>} Response message or structured response
     */
    async _handleOriginInput(userId, message) {
        // Special commands
        if (message.toLowerCase() === 'help') {
            return this._getHelpMessage();
        }

        if (['restart', 'start over'].includes(message.toLowerCase())) {
            this._clearUserSession(userId);
            this._setUserState(userId, ConversationState.WAITING_FOR_ORIGIN);
            return this._getOriginSelectionOptions();
        }

        if (['buttons', 'quick replies'].includes(message.toLowerCase())) {
            this._setUserState(userId, ConversationState.WAITING_FOR_ORIGIN);
            return this._getOriginSelectionOptions();
        }

        // Check if user selected a train line
        if (['MRT-3', 'LRT-1', 'LRT-2'].includes(message.toUpperCase())) {
            this._setUserState(userId, ConversationState.WAITING_FOR_ORIGIN_LINE);
            return await this._handleOriginLineSelection(userId, message);
        }

        // Validate station
        const validatedStation = this.stationManager.validateStation(message);

        if (validatedStation) {
            // Valid origin station
            this._setUserData(userId, 'origin', validatedStation);
            this._setUserState(userId, ConversationState.WAITING_FOR_DESTINATION);

            return this._getDestinationSelectionOptions(validatedStation);
        } else {
            // Invalid station, provide suggestions and quick reply option
            const suggestions = this.stationManager.getStationSuggestions(message);
            if (suggestions.length > 0) {
                const suggestionText = formatStationSuggestions(suggestions, message);
                return suggestionText + "\n\nOr use quick replies by typing 'buttons' 🔘";
            } else {
                return {
                    text: `❌ Sorry, I couldn't find '${message}'. ` +
                          "Please try again or use the quick reply buttons below:",
                    quick_replies: [
                        { content_type: 'text', title: '🚇 MRT-3', payload: 'MRT-3' },
                        { content_type: 'text', title: '🚅 LRT-1', payload: 'LRT-1' },
                        { content_type: 'text', title: '🚆 LRT-2', payload: 'LRT-2' },
                        { content_type: 'text', title: '🆘 Help', payload: 'help' }
                    ]
                };
            }
        }
    }

    /**
     * Handle origin line selection from quick replies.
     * @param {string} userId - User identifier
     * @param {string} message - User message
     * @returns {Promise<string|object>} Response message or structured response
     */
    async _handleOriginLineSelection(userId, message) {
        const messageUpper = message.toUpperCase();

        if (['MRT-3', 'LRT-1', 'LRT-2'].includes(messageUpper)) {
            this._setUserData(userId, 'selected_origin_line', messageUpper);
            this._setUserState(userId, ConversationState.WAITING_FOR_ORIGIN_STATION);
            return this._getLineStationsQuickReplies(messageUpper, true);
        } else if (message.toUpperCase() === 'TYPE_STATION') {
            this._setUserState(userId, ConversationState.WAITING_FOR_ORIGIN);
            return "Please type your current train station:";
        } else {
            // Handle as regular station input
            return await this._handleOriginInput(userId, message);
        }
    }

    /**
     * Handle origin station selection from quick replies.
     * @param {string} userId - User identifier
     * @param {string} message - User message
     * @returns {Promise<string|object>} Response message or structured response
     */
    async _handleOriginStationSelection(userId, message) {
        if (message === 'BACK_TO_LINES') {
            this._setUserState(userId, ConversationState.WAITING_FOR_ORIGIN);
            return this._getOriginSelectionOptions();
        } else if (message.startsWith('MORE_')) {
            const line = message.replace('MORE_', '');
            return this._getMoreStationsMessage(line, true);
        } else {
            // Validate station
            const validatedStation = this.stationManager.validateStation(message);
            if (validatedStation) {
                this._setUserData(userId, 'origin', validatedStation);
                this._setUserState(userId, ConversationState.WAITING_FOR_DESTINATION);
                return this._getDestinationSelectionOptions(validatedStation);
            } else {
                return "❌ Invalid station. Please select from the buttons or type a valid station name.";
            }
        }
    }

    /**
     * Handle destination station input and provide train schedule.
     * @param {string} userId - User identifier
     * @param {string} message - User message
     * @returns {Promise<string|object>} Response message with train schedule or structured response
     */
    async _handleDestinationInput(userId, message) {
        // Special commands
        if (message.toLowerCase() === 'help') {
            return this._getHelpMessage();
        }

        if (['restart', 'start over'].includes(message.toLowerCase())) {
            this._clearUserSession(userId);
            this._setUserState(userId, ConversationState.WAITING_FOR_ORIGIN);
            return this._getOriginSelectionOptions();
        }

        if (['buttons', 'quick replies'].includes(message.toLowerCase())) {
            const origin = this._getUserData(userId, 'origin');
            return this._getDestinationSelectionOptions(origin);
        }

        // Get origin from session
        const origin = this._getUserData(userId, 'origin');

        if (!origin) {
            // Session data lost, restart
            this._setUserState(userId, ConversationState.WAITING_FOR_ORIGIN);
            return this._getOriginSelectionOptions();
        }

        // Check if user selected a train line
        if (['MRT-3', 'LRT-1', 'LRT-2'].includes(message.toUpperCase())) {
            this._setUserState(userId, ConversationState.WAITING_FOR_DESTINATION_LINE);
            return await this._handleDestinationLineSelection(userId, message);
        }

        // Validate destination
        const validatedDestination = this.stationManager.validateStation(message);

        if (!validatedDestination) {
            // Invalid destination, provide suggestions and quick reply option
            const suggestions = this.stationManager.getStationSuggestions(message);
            if (suggestions.length > 0) {
                const suggestionText = formatStationSuggestions(suggestions, message) + `\n\nReminder: You're traveling from ${origin}.`;
                return suggestionText + "\n\nOr use quick replies by typing 'buttons' 🔘";
            } else {
                return {
                    text: `❌ Sorry, I couldn't find '${message}' as a destination station. ` +
                          `You're traveling from ${origin}. Please try again or use quick replies:`,
                    quick_replies: [
                        { content_type: 'text', title: '🚇 MRT-3', payload: 'MRT-3' },
                        { content_type: 'text', title: '🚅 LRT-1', payload: 'LRT-1' },
                        { content_type: 'text', title: '🚆 LRT-2', payload: 'LRT-2' },
                        { content_type: 'text', title: '🆘 Help', payload: 'help' }
                    ]
                };
            }
        }

        // Check if origin and destination are the same
        if (origin.toLowerCase() === validatedDestination.toLowerCase()) {
            return getErrorMessage('same_station');
        }

        // Validate the route
        const routeInfo = this.stationManager.getRouteInfo(origin, validatedDestination);

        if (!routeInfo) {
            return `❌ Sorry, I couldn't find a valid route from ${origin} to ${validatedDestination}. ` +
                   "Please check the station names and try again.";
        }

        // Get train schedule data
        try {
            const line = routeInfo.line || 'Unknown';
            const scheduleData = await this.rushScraper.scrapeTrainSchedule(origin, validatedDestination, line);

            if (scheduleData) {
                // Format and return the schedule
                let response = formatTrainScheduleMessage(scheduleData);

                // Reset conversation state and ask if they need another query
                this._setUserState(userId, ConversationState.COMPLETED);
                this._setUserData(userId, 'last_query_time', new Date());

                response += "\n\n💬 Need another route? Just send me your current station!";

                return response;
            } else {
                return getErrorMessage('no_data');
            }
        } catch (error) {
            console.error(`Error getting schedule data for ${userId}:`, error);
            return getErrorMessage('network');
        }
    }

    /**
     * Handle destination line selection from quick replies.
     * @param {string} userId - User identifier
     * @param {string} message - User message
     * @returns {Promise<string|object>} Response message or structured response
     */
    async _handleDestinationLineSelection(userId, message) {
        const messageUpper = message.toUpperCase();

        if (['MRT-3', 'LRT-1', 'LRT-2'].includes(messageUpper)) {
            this._setUserData(userId, 'selected_destination_line', messageUpper);
            this._setUserState(userId, ConversationState.WAITING_FOR_DESTINATION_STATION);
            return this._getLineStationsQuickReplies(messageUpper, false);
        } else if (message.toUpperCase() === 'TYPE_STATION') {
            this._setUserState(userId, ConversationState.WAITING_FOR_DESTINATION);
            const origin = this._getUserData(userId, 'origin');
            return `You're traveling from ${origin}. Please type your destination station:`;
        } else {
            // Handle as regular station input
            return await this._handleDestinationInput(userId, message);
        }
    }

    /**
     * Handle destination station selection from quick replies.
     * @param {string} userId - User identifier
     * @param {string} message - User message
     * @returns {Promise<string|object>} Response message or structured response
     */
    async _handleDestinationStationSelection(userId, message) {
        if (message === 'BACK_TO_LINES') {
            const origin = this._getUserData(userId, 'origin');
            this._setUserState(userId, ConversationState.WAITING_FOR_DESTINATION);
            return this._getDestinationSelectionOptions(origin);
        } else if (message.startsWith('MORE_')) {
            const line = message.replace('MORE_', '');
            return this._getMoreStationsMessage(line, false);
        } else {
            // Process as destination
            return await this._handleDestinationInput(userId, message);
        }
    }

    /**
     * Get message showing all stations for a line.
     * @param {string} line - Train line name
     * @param {boolean} isOrigin - True if selecting origin, false for destination
     * @returns {string} Message with all stations
     */
    _getMoreStationsMessage(line, isOrigin) {
        const stations = this.stationManager.getLineStations(line);
        const stationType = isOrigin ? "origin" : "destination";

        let message = `🚉 All ${line} Stations:\n\n`;
        for (let i = 0; i < stations.length; i++) {
            message += `${(i + 1).toString().padStart(2, ' ')}. ${stations[i]}\n`;
        }

        message += `\n📝 Type your ${stationType} station name from the list above.`;
        return message;
    }

    // Session management methods
    _getUserSession(userId) {
        // Clean up expired sessions
        this._cleanupExpiredSessions();

        if (!this.userSessions.has(userId)) {
            this.userSessions.set(userId, {
                state: ConversationState.INITIAL,
                data: {},
                createdAt: new Date(),
                lastActivity: new Date()
            });
        } else {
            // Update last activity
            const session = this.userSessions.get(userId);
            session.lastActivity = new Date();
        }

        return this.userSessions.get(userId);
    }

    _setUserState(userId, state) {
        const session = this._getUserSession(userId);
        session.state = state;
    }

    _setUserData(userId, key, value) {
        const session = this._getUserSession(userId);
        session.data[key] = value;
    }

    _getUserData(userId, key) {
        const session = this._getUserSession(userId);
        return session.data[key];
    }

    _clearUserSession(userId) {
        if (this.userSessions.has(userId)) {
            this.userSessions.delete(userId);
        }
    }

    _cleanupExpiredSessions() {
        const currentTime = new Date();
        const expiredUsers = [];

        for (const [userId, session] of this.userSessions.entries()) {
            const lastActivity = session.lastActivity || session.createdAt;
            if (currentTime.getTime() - lastActivity.getTime() > this.sessionTimeout) {
                expiredUsers.push(userId);
            }
        }

        for (const userId of expiredUsers) {
            this.userSessions.delete(userId);
        }

        if (expiredUsers.length > 0) {
            console.log(`Cleaned up ${expiredUsers.length} expired sessions`);
        }
    }

    _getHelpMessage() {
        const mrtStations = this.stationManager.getLineStations("MRT-3").slice(0, 5).join(", ");
        const lrt1Stations = this.stationManager.getLineStations("LRT-1").slice(0, 5).join(", ");
        const lrt2Stations = this.stationManager.getLineStations("LRT-2").slice(0, 5).join(", ");

        return (
            "🚆 **Available Train Lines & Stations:**\n\n" +
            `**MRT-3**: ${mrtStations}... and more\n` +
            `**LRT-1**: ${lrt1Stations}... and more\n` +
            `**LRT-2**: ${lrt2Stations}... and more\n\n` +
            "💡 **How to use:**\n" +
            "1. Tell me your current station\n" +
            "2. Tell me where you want to go\n" +
            "3. Get real-time train schedules!\n\n" +
            "Just type your station name to get started!"
        );
    }

    /**
     * Get current user conversation state.
     * @param {string} userId - User identifier
     * @returns {string} Current conversation state
     */
    getUserState(userId) {
        const session = this._getUserSession(userId);
        return session.state || ConversationState.INITIAL;
    }

    /**
     * Get conversation handler statistics.
     * @returns {object} Statistics object
     */
    getStats() {
        // Clean up expired sessions first
        this._cleanupExpiredSessions();

        const activeSessions = this.userSessions.size;
        const stateCounts = {};

        for (const session of this.userSessions.values()) {
            const state = session.state || ConversationState.INITIAL;
            stateCounts[state] = (stateCounts[state] || 0) + 1;
        }

        return {
            activeSessions: activeSessions,
            stateDistribution: stateCounts,
            sessionTimeoutMinutes: Math.floor(this.sessionTimeout / (60 * 1000)),
            scraperCacheInfo: this.rushScraper.getCacheInfo()
        };
    }
}

module.exports = ConversationHandler;