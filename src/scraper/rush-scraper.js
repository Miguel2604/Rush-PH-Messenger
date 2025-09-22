/**
 * Web scraper for rush-ph.com to get train arrival times and schedules.
 * Supports both simulated data and real browser-based scraping using Puppeteer.
 */

const axios = require('axios');
const puppeteer = require('puppeteer');

class RushScraper {
    /**
     * Initialize the scraper with caching capabilities.
     * @param {object} options - Configuration options
     */
    constructor(options = {}) {
        this.baseUrl = 'https://rush-ph.com';
        this.cacheDuration = options.cacheDuration || parseInt(process.env.SCRAPER_CACHE_DURATION) || 300;
        this.useBrowserScraper = options.useBrowser ?? (process.env.USE_BROWSER_SCRAPER === 'true');
        this.browserTimeout = options.browserTimeout || parseInt(process.env.BROWSER_TIMEOUT) || 30000;
        this.cache = new Map();
        this.browser = null;
        
        // Setup axios instance for fallback
        this.httpClient = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        
        console.log(`RushScraper initialized - Browser scraping: ${this.useBrowserScraper ? 'ENABLED' : 'DISABLED'}`);
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
     * Initialize Puppeteer browser instance.
     * @returns {Promise<object>} Browser instance
     */
    async _initBrowser() {
        if (this.browser) {
            return this.browser;
        }

        try {
            console.log('Launching Puppeteer browser...');
            this.browser = await puppeteer.launch({
                headless: 'new', // Use new headless mode
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-default-apps'
                ],
                timeout: this.browserTimeout
            });
            
            console.log('Puppeteer browser launched successfully');
            return this.browser;
        } catch (error) {
            console.error('Failed to launch browser:', error.message);
            this.browser = null;
            throw error;
        }
    }

    /**
     * Close browser instance.
     */
    async _closeBrowser() {
        if (this.browser) {
            try {
                await this.browser.close();
                console.log('Browser closed successfully');
            } catch (error) {
                console.error('Error closing browser:', error.message);
            } finally {
                this.browser = null;
            }
        }
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
     * Attempt to extract real data from rush-ph.com using browser automation.
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {Promise<object|null>} Extracted data or null
     */
    async _attemptDataExtraction(origin, destination, line) {
        if (!this.useBrowserScraper) {
            console.log('Browser scraping disabled, skipping real data extraction');
            return null;
        }

        let page = null;
        try {
            console.log(`🌐 Attempting to scrape real data for ${origin} → ${destination} on ${line}`);
            
            const browser = await this._initBrowser();
            page = await browser.newPage();
            
            // Set viewport and user agent
            await page.setViewport({ width: 1366, height: 768 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Navigate to the site
            console.log('📱 Navigating to rush-ph.com...');
            await page.goto(this.baseUrl, { 
                waitUntil: 'networkidle0',
                timeout: this.browserTimeout 
            });
            
            // Wait for the React app to load
            console.log('⏳ Waiting for React app to initialize...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Look for train data containers or schedule elements
            const trainData = await this._extractTrainDataFromPage(page, origin, destination, line);
            
            if (trainData) {
                console.log(`✅ Successfully extracted real data from rush-ph.com`);
                return trainData;
            } else {
                console.log('❌ No train data found on page');
                return null;
            }
            
        } catch (error) {
            console.error('🚫 Browser scraping failed:', error.message);
            return null;
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (closeError) {
                    console.error('Error closing page:', closeError.message);
                }
            }
        }
    }
    
    /**
     * Extract train data from the loaded page.
     * @param {object} page - Puppeteer page object
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station 
     * @param {string} line - Train line
     * @returns {Promise<object|null>} Extracted train data
     */
    async _extractTrainDataFromPage(page, origin, destination, line) {
        try {
            // Method 1: Try to find and interact with station selectors
            const hasStationSelectors = await this._tryStationSelection(page, origin, destination);
            
            if (hasStationSelectors) {
                // Wait for results to load
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Extract schedule data from the results
                const scheduleData = await this._extractScheduleFromDOM(page, origin, destination, line);
                if (scheduleData) {
                    return scheduleData;
                }
            }
            
            // Method 2: Look for any pre-loaded train data in the page
            const preloadedData = await this._extractPreloadedData(page, origin, destination, line);
            if (preloadedData) {
                return preloadedData;
            }
            
            // Method 3: Check network requests for API calls
            const networkData = await this._interceptNetworkData(page, origin, destination, line);
            if (networkData) {
                return networkData;
            }
            
            return null;
        } catch (error) {
            console.error('Error extracting data from page:', error.message);
            return null;
        }
    }

    /**
     * Try to interact with station selectors on the page.
     * @param {object} page - Puppeteer page object
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @returns {Promise<boolean>} True if selectors were found and used
     */
    async _tryStationSelection(page, origin, destination) {
        try {
            console.log('🔍 Looking for station selection elements...');
            
            // Common selectors for station inputs/dropdowns
            const selectors = [
                'select[name*="origin"]', 'select[name*="from"]', 'input[name*="origin"]', 'input[name*="from"]',
                'select[name*="destination"]', 'select[name*="to"]', 'input[name*="destination"]', 'input[name*="to"]',
                'select[placeholder*="origin"]', 'select[placeholder*="from"]', 
                'input[placeholder*="origin"]', 'input[placeholder*="from"]',
                'select[placeholder*="destination"]', 'select[placeholder*="to"]',
                'input[placeholder*="destination"]', 'input[placeholder*="to"]',
                '.origin-select', '.from-select', '.destination-select', '.to-select',
                '#origin', '#from', '#destination', '#to'
            ];
            
            for (const selector of selectors) {
                const element = await page.$(selector);
                if (element) {
                    console.log(`✅ Found selector: ${selector}`);
                    // Try to interact with the element
                    await this._interactWithStationElement(page, element, origin, destination);
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('Error in station selection:', error.message);
            return false;
        }
    }
    
    /**
     * Interact with station input/select elements.
     * @param {object} page - Puppeteer page object
     * @param {object} element - Station input element
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     */
    async _interactWithStationElement(page, element, origin, destination) {
        try {
            const tagName = await element.evaluate(el => el.tagName.toLowerCase());
            
            if (tagName === 'select') {
                // Handle dropdown selection
                await this._selectFromDropdown(page, element, origin);
            } else if (tagName === 'input') {
                // Handle text input
                await element.click();
                await element.type(origin);
                await page.keyboard.press('Tab'); // Move to next field
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error('Error interacting with station element:', error.message);
        }
    }
    
    /**
     * Select option from dropdown.
     * @param {object} page - Puppeteer page object
     * @param {object} selectElement - Select element
     * @param {string} stationName - Station name to select
     */
    async _selectFromDropdown(page, selectElement, stationName) {
        try {
            const options = await selectElement.$$eval('option', opts => 
                opts.map(opt => ({ value: opt.value, text: opt.textContent }))
            );
            
            // Find matching option
            const matchingOption = options.find(opt => 
                opt.text.toLowerCase().includes(stationName.toLowerCase()) ||
                opt.value.toLowerCase().includes(stationName.toLowerCase())
            );
            
            if (matchingOption) {
                await selectElement.select(matchingOption.value);
                console.log(`Selected: ${matchingOption.text}`);
            }
        } catch (error) {
            console.error('Error selecting from dropdown:', error.message);
        }
    }
    
    /**
     * Extract schedule data from DOM elements.
     * @param {object} page - Puppeteer page object
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {Promise<object|null>} Extracted schedule data
     */
    async _extractScheduleFromDOM(page, origin, destination, line) {
        try {
            console.log('📋 Extracting schedule data from DOM...');
            
            // Look for common schedule table/list patterns
            const scheduleData = await page.evaluate((orig, dest, trainLine) => {
                const tables = document.querySelectorAll('table, .schedule, .timetable, .train-times');
                const lists = document.querySelectorAll('ul, ol, .train-list, .departure-times');
                const cards = document.querySelectorAll('.card, .schedule-card, .train-card');
                
                const allElements = [...tables, ...lists, ...cards];
                const trainTimes = [];
                
                for (const element of allElements) {
                    const text = element.textContent || '';
                    
                    // Look for time patterns (HH:MM)
                    const timeMatches = text.match(/\b\d{1,2}:\d{2}\b/g);
                    if (timeMatches && timeMatches.length > 0) {
                        timeMatches.forEach(time => {
                            if (time && !trainTimes.some(t => t.time === time)) {
                                trainTimes.push({
                                    time: time,
                                    minutesAway: 0, // Will calculate later
                                    status: 'On Time'
                                });
                            }
                        });
                    }
                }
                
                return trainTimes.length > 0 ? {
                    line: trainLine,
                    origin: orig,
                    destination: dest,
                    nextTrains: trainTimes.slice(0, 5),
                    extractedAt: new Date().toISOString(),
                    simulated: false
                } : null;
            }, origin, destination, line);
            
            if (scheduleData && scheduleData.nextTrains.length > 0) {
                // Calculate minutes away
                scheduleData.nextTrains = this._calculateMinutesAway(scheduleData.nextTrains);
                scheduleData.estimatedTravelTime = this._estimateTravelTime(origin, destination);
                scheduleData.lastUpdated = new Date().toISOString();
                scheduleData.status = 'operational';
                
                console.log(`✅ Extracted ${scheduleData.nextTrains.length} train times from DOM`);
                return scheduleData;
            }
            
            return null;
        } catch (error) {
            console.error('Error extracting schedule from DOM:', error.message);
            return null;
        }
    }
    
    /**
     * Look for preloaded data in the page.
     * @param {object} page - Puppeteer page object
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {Promise<object|null>} Preloaded data
     */
    async _extractPreloadedData(page, origin, destination, line) {
        try {
            console.log('🔍 Looking for preloaded data...');
            
            const preloadedData = await page.evaluate(() => {
                // Check window object for train data
                const possibleDataKeys = ['trainData', 'scheduleData', 'rushData', 'appData'];
                
                for (const key of possibleDataKeys) {
                    if (window[key] && typeof window[key] === 'object') {
                        return window[key];
                    }
                }
                
                // Check for JSON in script tags
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const content = script.textContent || '';
                    if (content.includes('train') || content.includes('schedule')) {
                        try {
                            const jsonMatch = content.match(/{[^}]*train[^}]*}/i);
                            if (jsonMatch) {
                                return JSON.parse(jsonMatch[0]);
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
                
                return null;
            });
            
            if (preloadedData) {
                console.log('✅ Found preloaded data');
                return this._processRawData(preloadedData, origin, destination, line);
            }
            
            return null;
        } catch (error) {
            console.error('Error extracting preloaded data:', error.message);
            return null;
        }
    }
    
    /**
     * Intercept network requests for API data.
     * @param {object} page - Puppeteer page object
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {Promise<object|null>} Network data
     */
    async _interceptNetworkData(page, origin, destination, line) {
        try {
            console.log('🌐 Setting up network interception...');
            
            let networkData = null;
            
            // Listen for responses
            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('api') || url.includes('train') || url.includes('schedule')) {
                    try {
                        const data = await response.json();
                        if (data && (data.trains || data.schedules || data.departures)) {
                            networkData = data;
                        }
                    } catch (e) {
                        // Response might not be JSON
                    }
                }
            });
            
            // Trigger a refresh or search to capture API calls
            await page.reload({ waitUntil: 'networkidle0' });
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (networkData) {
                console.log('✅ Intercepted network data');
                return this._processRawData(networkData, origin, destination, line);
            }
            
            return null;
        } catch (error) {
            console.error('Error intercepting network data:', error.message);
            return null;
        }
    }
    
    /**
     * Process raw data from various sources.
     * @param {object} rawData - Raw data object
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {object|null} Processed data
     */
    _processRawData(rawData, origin, destination, line) {
        try {
            // This would need to be customized based on rush-ph.com's actual data structure
            console.debug('Processing raw data from rush-ph.com...');
            
            // For now, return null to indicate we need to implement the specific structure
            // Once we know the actual API response format, we can process it here
            return null;
        } catch (error) {
            console.error('Error processing raw data:', error.message);
            return null;
        }
    }
    
    /**
     * Calculate minutes away for train times.
     * @param {Array} trainTimes - Array of train time objects
     * @returns {Array} Updated train times with minutes away
     */
    _calculateMinutesAway(trainTimes) {
        const now = new Date();
        
        return trainTimes.map(train => {
            try {
                const [hours, minutes] = train.time.split(':').map(Number);
                const trainDate = new Date();
                trainDate.setHours(hours, minutes, 0, 0);
                
                // If train time is earlier than now, assume it's for tomorrow
                if (trainDate < now) {
                    trainDate.setDate(trainDate.getDate() + 1);
                }
                
                const minutesAway = Math.round((trainDate - now) / 60000);
                
                return {
                    ...train,
                    minutesAway: Math.max(0, minutesAway)
                };
            } catch (error) {
                return {
                    ...train,
                    minutesAway: 0
                };
            }
        });
    }
    
    /**
     * Estimate travel time between stations.
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @returns {number} Estimated travel time in minutes
     */
    _estimateTravelTime(origin, destination) {
        // Simple estimation - could be improved with actual station data
        const avgTimePerStation = 3;
        const estimatedStations = Math.abs(this._hashString(origin + destination) % 15) + 1;
        return avgTimePerStation * estimatedStations;
    }
    
    /**
     * Cleanup method to close browser when scraper is destroyed.
     */
    async destroy() {
        await this._closeBrowser();
        console.log('RushScraper destroyed');
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