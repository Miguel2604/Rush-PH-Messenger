/**
 * Web scraper for rush-ph.com to get train arrival times and schedules.
 */

const axios = require('axios');

class RushScraper {
    /**
     * Initialize the scraper with caching capabilities.
     * @param {number} cacheDuration - Cache duration in seconds (default: 5 minutes)
     */
    constructor(cacheDuration = 300) {
        this.baseUrl = 'https://rush-ph.com';
        this.cacheDuration = cacheDuration;
        this.cache = new Map();
        
        // Setup axios instance
        this.httpClient = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });
        
        console.log('RushScraper initialized');
    }

    /**
     * Check if cached data is still valid.
     * @param {Date} timestamp - Cache timestamp
     * @returns {boolean} True if cache is still valid
     */
    _isCacheValid(timestamp) {
        return Date.now() - timestamp.getTime() < this.cacheDuration * 1000;
    }

    /**
     * Generate cache key for origin-destination pair.
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @returns {string} Cache key
     */
    _getCacheKey(origin, destination) {
        return `${origin.toLowerCase()}_${destination.toLowerCase()}`;
    }

    /**
     * Simulate train schedule data since rush-ph.com requires JavaScript.
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {object} Simulated train schedule data
     */
    _simulateTrainData(origin, destination, line) {
        console.log(`Simulating train data for ${origin} to ${destination} on ${line}`);
        
        const currentTime = new Date();
        const trainTimes = [];
        const intervals = [5, 7, 8, 10, 12]; // Minutes between trains

        // Generate next 5 trains
        for (let i = 0; i < 5; i++) {
            const minutesAhead = intervals.slice(0, i + 1).reduce((sum, interval) => sum + interval, 0);
            const trainTime = new Date(currentTime.getTime() + minutesAhead * 60000);
            
            trainTimes.push({
                time: trainTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                minutesAway: minutesAhead,
                status: minutesAhead <= 15 ? 'On Time' : (minutesAhead > 20 ? 'Delayed' : 'On Time')
            });
        }

        // Estimate travel time based on stations between origin and destination
        const baseTravelTime = 3; // 3 minutes per station
        const stationCount = Math.abs(this._hashString(origin) % 10) + 2; // Simulate station count
        const estimatedTravel = baseTravelTime * stationCount;

        return {
            line: line,
            origin: origin,
            destination: destination,
            nextTrains: trainTimes,
            estimatedTravelTime: estimatedTravel,
            lastUpdated: currentTime.toISOString(),
            status: 'operational',
            simulated: true // Flag to indicate this is simulated data
        };
    }

    /**
     * Simple hash function for string.
     * @param {string} str - String to hash
     * @returns {number} Hash value
     */
    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Scrape train schedule data for a specific route.
     * Falls back to simulated data if scraping fails.
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {Promise<object|null>} Train schedule data
     */
    async scrapeTrainSchedule(origin, destination, line) {
        const cacheKey = this._getCacheKey(origin, destination);
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            const { data, timestamp } = this.cache.get(cacheKey);
            if (this._isCacheValid(timestamp)) {
                console.log(`Returning cached data for ${origin} to ${destination}`);
                return data;
            }
        }

        try {
            // Attempt to scrape real data
            console.log(`Attempting to scrape data for ${origin} to ${destination}`);
            
            const response = await this._attemptDataExtraction(origin, destination, line);
            
            if (response) {
                // Cache successful response
                this.cache.set(cacheKey, { data: response, timestamp: new Date() });
                return response;
            }
        } catch (error) {
            console.error('Error scraping data:', error.message);
        }

        // Fallback to simulated data
        console.log('Falling back to simulated data');
        const simulatedData = this._simulateTrainData(origin, destination, line);
        
        // Cache simulated data
        this.cache.set(cacheKey, { data: simulatedData, timestamp: new Date() });
        return simulatedData;
    }

    /**
     * Attempt to extract real data from rush-ph.com.
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {Promise<object|null>} Extracted data or null
     */
    async _attemptDataExtraction(origin, destination, line) {
        try {
            // Method 1: Check if there are API endpoints we can call directly
            const apiUrls = [
                `${this.baseUrl}/api/schedules`,
                `${this.baseUrl}/api/trains`,
                `${this.baseUrl}/schedules`
            ];

            for (const apiUrl of apiUrls) {
                try {
                    const response = await this.httpClient.get(apiUrl);
                    if (response.data && response.headers['content-type']?.includes('application/json')) {
                        const processedData = this._processApiData(response.data, origin, destination, line);
                        if (processedData) {
                            return processedData;
                        }
                    }
                } catch (error) {
                    console.debug(`API endpoint ${apiUrl} failed:`, error.message);
                    continue;
                }
            }

            // Method 2: Try to parse the main page for any embedded data
            const response = await this.httpClient.get(this.baseUrl);
            if (response.status === 200) {
                // Look for JSON data in script tags (basic pattern matching)
                const htmlContent = response.data;
                const jsonMatches = htmlContent.match(/{[^{}]*"train"[^{}]*}/gi);
                
                if (jsonMatches) {
                    for (const match of jsonMatches) {
                        try {
                            const data = JSON.parse(match);
                            const processedData = this._processApiData(data, origin, destination, line);
                            if (processedData) {
                                return processedData;
                            }
                        } catch (parseError) {
                            continue;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Data extraction attempt failed:', error.message);
        }

        return null;
    }

    /**
     * Process API data and format it for our application.
     * @param {object} data - Raw API data
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {object|null} Processed data or null
     */
    _processApiData(data, origin, destination, line) {
        // This method would process real API data if we successfully extracted it
        // For now, we'll return null to fall back to simulated data
        console.debug('Processing API data - implementation pending');
        return null;
    }

    /**
     * Get operational status for a specific train line.
     * @param {string} line - Train line name
     * @returns {Promise<object>} Line status information
     */
    async getLineStatus(line) {
        try {
            const response = await this.httpClient.get(`${this.baseUrl}/status`);
            if (response.status === 200) {
                // Process status data if available
            }
        } catch (error) {
            console.debug(`Could not fetch line status: ${error.message}`);
        }

        // Return simulated status
        return {
            line: line,
            status: 'operational',
            lastUpdated: new Date().toISOString(),
            message: 'Service running normally',
            simulated: true
        };
    }

    /**
     * Clear the scraper cache.
     */
    clearCache() {
        this.cache.clear();
        console.log('Scraper cache cleared');
    }

    /**
     * Get information about cached data.
     * @returns {object} Cache information
     */
    getCacheInfo() {
        const cacheInfo = {
            totalEntries: this.cache.size,
            cacheDuration: this.cacheDuration,
            entries: []
        };

        for (const [key, { data, timestamp }] of this.cache.entries()) {
            cacheInfo.entries.push({
                key: key,
                timestamp: timestamp.toISOString(),
                valid: this._isCacheValid(timestamp),
                simulated: data.simulated || false
            });
        }

        return cacheInfo;
    }
}

module.exports = RushScraper;