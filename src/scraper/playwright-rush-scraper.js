/**
 * Playwright-based web scraper for rush-ph.com to get train arrival times and schedules.
 * Improved version that properly handles the search dropdown and React components.
 */

const { chromium, firefox, webkit } = require('playwright');

class PlaywrightRushScraper {
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
        this.browserType = options.browserType || 'chromium'; // chromium, firefox, webkit
        
        console.log(`PlaywrightRushScraper initialized - Browser scraping: ${this.useBrowserScraper ? 'ENABLED' : 'DISABLED'} (${this.browserType})`);
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
     * Initialize Playwright browser instance.
     * @returns {Promise<object>} Browser instance
     */
    async _initBrowser() {
        if (this.browser) {
            return this.browser;
        }

        try {
            console.log(`🚀 Launching Playwright ${this.browserType} browser...`);
            
            const browserEngine = this.browserType === 'firefox' ? firefox : 
                                 this.browserType === 'webkit' ? webkit : chromium;
                                 
            this.browser = await browserEngine.launch({
                headless: true, // Change to false for debugging
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--disable-default-apps',
                    '--disable-features=VizDisplayCompositor'
                ],
                timeout: this.browserTimeout
            });
            
            console.log('✅ Playwright browser launched successfully');
            return this.browser;
        } catch (error) {
            console.error('❌ Failed to launch browser:', error.message);
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
                console.log('🔒 Browser closed successfully');
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
        console.log(`🎭 Simulating train data for ${origin} to ${destination} on ${line}`);
        
        const currentTime = new Date();
        const trainTimes = [];
        const intervals = [3, 5, 7, 8, 10]; // Minutes between trains

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

        const stationCount = Math.abs(this._hashString(origin) % 10) + 2;
        const estimatedTravel = 3 * stationCount;

        return {
            line: line,
            origin: origin,
            destination: destination,
            nextTrains: trainTimes,
            estimatedTravelTime: estimatedTravel,
            lastUpdated: currentTime.toISOString(),
            status: 'operational',
            simulated: true
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
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    /**
     * Scrape train schedule data for a specific route.
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
                console.log(`📦 Returning cached data for ${origin} to ${destination}`);
                return data;
            }
        }

        try {
            console.log(`🔍 Attempting to scrape data for ${origin} to ${destination}`);
            
            const response = await this._attemptDataExtraction(origin, destination, line);
            
            if (response) {
                this.cache.set(cacheKey, { data: response, timestamp: new Date() });
                return response;
            }
        } catch (error) {
            console.error('❌ Error scraping data:', error.message);
        }

        // Fallback to simulated data
        console.log('🎭 Falling back to simulated data');
        const simulatedData = this._simulateTrainData(origin, destination, line);
        
        this.cache.set(cacheKey, { data: simulatedData, timestamp: new Date() });
        return simulatedData;
    }

    /**
     * Attempt to extract real data from rush-ph.com using Playwright.
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {Promise<object|null>} Extracted data or null
     */
    async _attemptDataExtraction(origin, destination, line) {
        if (!this.useBrowserScraper) {
            console.log('🚫 Browser scraping disabled, skipping real data extraction');
            return null;
        }

        let context = null;
        let page = null;
        
        try {
            console.log(`🌐 Attempting to scrape real data for ${origin} → ${destination} on ${line}`);
            
            const browser = await this._initBrowser();
            
            // Create a new context with realistic settings
            context = await browser.newContext({
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale: 'en-US',
                timezoneId: 'Asia/Manila',
                geolocation: { latitude: 14.5995, longitude: 120.9842 }, // Manila coordinates
                permissions: ['geolocation']
            });
            
            page = await context.newPage();
            
            // Navigate to the site
            console.log('📱 Navigating to rush-ph.com...');
            await page.goto(this.baseUrl, { 
                waitUntil: 'networkidle',
                timeout: this.browserTimeout 
            });
            
            // Wait for React app to fully load
            console.log('⏳ Waiting for React app to initialize...');
            await page.waitForTimeout(5000);
            
            // Take initial screenshot for debugging
            if (process.env.DEBUG_SCREENSHOTS === 'true') {
                await page.screenshot({ 
                    path: 'debug-rush-ph-playwright-initial.png', 
                    fullPage: true 
                });
                console.log('📷 Initial screenshot saved');
            }
            
            // Step 1: First select the train line if needed
            const lineSelected = await this._selectTrainLine(page, line);
            if (lineSelected) {
                await page.waitForTimeout(2000);
            }
            
            // Step 2: Search for the origin station
            const searchSuccess = await this._performStationSearch(page, origin);
            if (!searchSuccess) {
                console.log('❌ Station search failed');
                return null;
            }
            
            // Wait for train data to load
            console.log('⏳ Waiting for train schedule data to load...');
            await page.waitForTimeout(5000);
            
            // Take screenshot after search
            if (process.env.DEBUG_SCREENSHOTS === 'true') {
                await page.screenshot({ 
                    path: 'debug-rush-ph-playwright-after-search.png', 
                    fullPage: true 
                });
                console.log('📷 Post-search screenshot saved');
            }
            
            // Step 3: Extract train schedule data
            const trainData = await this._extractTrainDataFromPage(page, origin, destination, line);
            
            if (trainData) {
                console.log(`✅ Successfully extracted real data from rush-ph.com`);
                return trainData;
            } else {
                console.log('❌ No train data found on page');
                return null;
            }
            
        } catch (error) {
            console.error('🚫 Playwright scraping failed:', error.message);
            return null;
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (closeError) {
                    console.error('Error closing page:', closeError.message);
                }
            }
            if (context) {
                try {
                    await context.close();
                } catch (closeError) {
                    console.error('Error closing context:', closeError.message);
                }
            }
        }
    }

    /**
     * Select train line on rush-ph.com.
     * @param {object} page - Playwright page object
     * @param {string} line - Train line to select
     * @returns {Promise<boolean>} True if line was selected
     */
    async _selectTrainLine(page, line) {
        try {
            console.log(`🚆 Selecting train line: ${line}`);
            
            // Wait for line buttons to be available
            await page.waitForSelector('button:has-text("LRT")', { timeout: 10000 });
            
            // Determine the correct line button text
            let buttonText;
            if (line && line.toUpperCase().includes('LRT-1')) {
                buttonText = 'LRT-1';
            } else if (line && line.toUpperCase().includes('MRT')) {
                buttonText = 'MRT-3';
            } else if (line && line.toUpperCase().includes('LRT-2')) {
                buttonText = 'LRT-2';
            } else if (line && line.toUpperCase().includes('PNR')) {
                buttonText = 'PNR';
            } else {
                // Default to LRT-1 if no specific line is determined
                buttonText = 'LRT-1';
            }
            
            console.log(`🎯 Clicking line button: ${buttonText}`);
            
            // Try to find and click the line button
            const lineButton = page.locator(`button:has-text("${buttonText}")`).first();
            
            if (await lineButton.isVisible()) {
                await lineButton.click();
                console.log(`✅ Successfully selected ${buttonText}`);
                return true;
            } else {
                console.log(`❌ Could not find ${buttonText} button`);
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error selecting train line:', error.message);
            return false;
        }
    }

    /**
     * Perform station search with proper dropdown handling.
     * @param {object} page - Playwright page object
     * @param {string} stationName - Station name to search for
     * @returns {Promise<boolean>} True if search was successful
     */
    async _performStationSearch(page, stationName) {
        try {
            console.log(`🔎 Searching for station: ${stationName}`);
            
            // Wait for the search input to be available
            const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[type="search"]').first();
            
            await searchInput.waitFor({ state: 'visible', timeout: 10000 });
            
            // Clear any existing text and focus the input
            await searchInput.click();
            await searchInput.fill('');
            
            // Type the station name with delay to trigger search
            await searchInput.type(stationName, { delay: 100 });
            
            console.log(`✍️ Typed "${stationName}" in search box`);
            
            // Wait for dropdown/suggestions to appear
            console.log('⏳ Waiting for search suggestions...');
            await page.waitForTimeout(2000);
            
            // Look for dropdown results/suggestions with multiple approaches
            const dropdownSelectors = [
                `text="${stationName}"`,
                `[data-testid*="suggestion"]:has-text("${stationName}")`,
                `[role="option"]:has-text("${stationName}")`,
                `.suggestion:has-text("${stationName}")`,
                `li:has-text("${stationName}")`,
                `div:has-text("${stationName}")`,
                `button:has-text("${stationName}")`
            ];
            
            let suggestionClicked = false;
            
            for (const selector of dropdownSelectors) {
                try {
                    const suggestions = page.locator(selector);
                    const count = await suggestions.count();
                    
                    console.log(`Found ${count} suggestions for selector: ${selector}`);
                    
                    if (count > 0) {
                        // Try to find exact or partial match
                        for (let i = 0; i < count; i++) {
                            const suggestion = suggestions.nth(i);
                            const text = await suggestion.textContent();
                            
                            console.log(`Suggestion ${i}: "${text}"`);
                            
                            if (text && (
                                text.toLowerCase().includes(stationName.toLowerCase()) ||
                                stationName.toLowerCase().includes(text.toLowerCase().trim())
                            )) {
                                console.log(`🎯 Clicking matching suggestion: "${text}"`);
                                
                                // Ensure the suggestion is visible and clickable
                                await suggestion.scrollIntoViewIfNeeded();
                                await suggestion.click();
                                
                                suggestionClicked = true;
                                break;
                            }
                        }
                        
                        if (suggestionClicked) break;
                    }
                } catch (e) {
                    console.log(`No suggestions found for ${selector}: ${e.message}`);
                }
            }
            
            if (!suggestionClicked) {
                console.log('🔄 No clickable suggestions found, trying Enter key...');
                await searchInput.press('Enter');
            }
            
            // Wait for the search result to process and page to update
            console.log('⏳ Waiting for search results to process...');
            await page.waitForTimeout(3000);
            
            // Check if we have train schedule data appearing
            const trainDataVisible = await this._waitForTrainData(page);
            
            if (trainDataVisible) {
                console.log('✅ Train data appeared after search');
                return true;
            } else {
                console.log('❌ No train data visible after search');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error performing station search:', error.message);
            return false;
        }
    }

    /**
     * Wait for train data to appear on the page.
     * @param {object} page - Playwright page object
     * @returns {Promise<boolean>} True if train data is visible
     */
    async _waitForTrainData(page) {
        try {
            // Look for various indicators that train data has loaded
            const dataIndicators = [
                '[class*="train"]',
                '[class*="schedule"]',
                '[class*="departure"]',
                '[class*="arrival"]',
                'text=minutes',
                'text=min',
                '[data-testid*="train"]',
                '[data-testid*="schedule"]'
            ];
            
            for (const indicator of dataIndicators) {
                try {
                    await page.waitForSelector(indicator, { timeout: 5000, state: 'visible' });
                    console.log(`✅ Found train data indicator: ${indicator}`);
                    return true;
                } catch (e) {
                    // Continue to next indicator
                }
            }
            
            // Also check for time patterns in the page content
            const pageContent = await page.textContent('body');
            const timePattern = /\b\d{1,2}:\d{2}\b/;
            
            if (timePattern.test(pageContent)) {
                console.log('✅ Found time patterns in page content');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error waiting for train data:', error.message);
            return false;
        }
    }

    /**
     * Extract train data from the loaded page using Playwright.
     * @param {object} page - Playwright page object
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station 
     * @param {string} line - Train line
     * @returns {Promise<object|null>} Extracted train data
     */
    async _extractTrainDataFromPage(page, origin, destination, line) {
        try {
            console.log('📋 Extracting train schedule data from page...');
            
            // Wait a bit more for dynamic content to fully render
            await page.waitForTimeout(3000);
            
            // Enhanced extraction using Playwright's powerful selectors
            const scheduleData = await page.evaluate(({ origin: orig, destination: dest, line: trainLine }) => {
                console.log('🔍 Looking for train schedule data on page...');
                
                const trainTimes = [];
                const processedTimes = new Set();
                
                // Enhanced selectors for rush-ph.com React components
                const selectors = [
                    // Time and schedule related
                    '[class*="time"]',
                    '[class*="schedule"]', 
                    '[class*="train"]',
                    '[class*="departure"]',
                    '[class*="arrival"]',
                    '[class*="eta"]',
                    '[class*="next"]',
                    
                    // React component patterns
                    '[data-testid*="time"]',
                    '[data-testid*="schedule"]',
                    '[data-testid*="train"]',
                    '[data-testid*="card"]',
                    
                    // Modern UI patterns
                    '.card, .train-card, .schedule-card',
                    '.bg-white, .bg-gray-100, .bg-blue-50, .bg-green-50',
                    '.p-4, .p-6, .px-4, .py-2, .m-2, .m-4',
                    '.flex, .grid, .block',
                    '.rounded, .rounded-lg, .shadow, .border',
                    
                    // Generic containers that might have times
                    'div, span, p, li, td, article, section'
                ];
                
                // Search through all potential elements
                for (const selector of selectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        
                        for (const element of elements) {
                            const text = element.textContent?.trim() || '';
                            
                            // Enhanced time pattern matching
                            const timePatterns = [
                                /\b(\d{1,2}:\d{2})\s*(AM|PM)?\b/gi,  // 12-hour format
                                /\b(\d{1,2}:\d{2})\b/g,             // 24-hour format  
                                /\b(\d{1,2}\.\d{2})\b/g,            // European format
                            ];
                            
                            for (const pattern of timePatterns) {
                                const matches = Array.from(text.matchAll(pattern));
                                
                                for (const match of matches) {
                                    const cleanTime = match[1] || match[0];
                                    
                                    if (cleanTime && !processedTimes.has(cleanTime)) {
                                        // Validate time format
                                        const timeParts = cleanTime.split(/[:.]/);
                                        if (timeParts.length === 2) {
                                            const hours = parseInt(timeParts[0]);
                                            const minutes = parseInt(timeParts[1]);
                                            
                                            if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                                                processedTimes.add(cleanTime);
                                                
                                                // Try to extract additional context
                                                let status = 'On Time';
                                                let minutesAway = null;
                                                let direction = null;
                                                
                                                // Look for status and timing info in surrounding content
                                                const surroundingText = element.parentElement?.textContent?.toLowerCase() || '';
                                                
                                                if (surroundingText.includes('delay')) status = 'Delayed';
                                                if (surroundingText.includes('cancel')) status = 'Cancelled';
                                                
                                                // Look for minutes away
                                                const minutesMatch = text.match(/(\d+)\s*min/i);
                                                if (minutesMatch) {
                                                    minutesAway = parseInt(minutesMatch[1]);
                                                }
                                                
                                                // Look for direction indicators
                                                if (surroundingText.includes('north') || surroundingText.includes('up')) {
                                                    direction = 'Northbound';
                                                } else if (surroundingText.includes('south') || surroundingText.includes('down')) {
                                                    direction = 'Southbound';
                                                }
                                                
                                                trainTimes.push({
                                                    time: cleanTime,
                                                    minutesAway: minutesAway || 0,
                                                    status: status,
                                                    direction: direction,
                                                    extractedFrom: selector,
                                                    context: text.substring(0, 100)
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.log(`Error processing selector ${selector}:`, e.message);
                    }
                }
                
                console.log(`📊 Total train times extracted: ${trainTimes.length}`);
                
                if (trainTimes.length > 0) {
                    // Remove duplicates and sort by time
                    const uniqueTimes = trainTimes.filter((time, index, self) => 
                        index === self.findIndex(t => t.time === time.time)
                    ).slice(0, 10); // Limit to 10 trains
                    
                    return {
                        line: trainLine,
                        origin: orig,
                        destination: dest,
                        nextTrains: uniqueTimes,
                        extractedAt: new Date().toISOString(),
                        simulated: false,
                        source: 'playwright-extraction',
                        extractionDetails: {
                            selectorsUsed: selectors.length,
                            totalFound: trainTimes.length,
                            uniqueReturned: uniqueTimes.length
                        }
                    };
                }
                
                return null;
                
            }, { origin, destination, line });
            
            if (scheduleData?.nextTrains?.length > 0) {
                // Post-process the data
                scheduleData.nextTrains = scheduleData.nextTrains.map(train => {
                    if (train.minutesAway === 0 || train.minutesAway === null) {
                        train.minutesAway = this._calculateMinutesFromTime(train.time);
                    }
                    return train;
                });
                
                scheduleData.estimatedTravelTime = this._estimateTravelTime(origin, destination);
                scheduleData.lastUpdated = new Date().toISOString();
                scheduleData.status = 'operational';
                
                console.log(`✅ Extracted ${scheduleData.nextTrains.length} train times using Playwright`);
                return scheduleData;
            }
            
            console.log('❌ No valid schedule data found');
            return null;
            
        } catch (error) {
            console.error('❌ Error extracting train data:', error.message);
            return null;
        }
    }

    /**
     * Calculate minutes from current time to given time string.
     * @param {string} timeString - Time in HH:MM format
     * @returns {number} Minutes from now
     */
    _calculateMinutesFromTime(timeString) {
        try {
            const now = new Date();
            const [hours, minutes] = timeString.split(':').map(Number);
            const targetTime = new Date(now);
            targetTime.setHours(hours, minutes, 0, 0);
            
            // If target time is earlier in the day, assume it's tomorrow
            if (targetTime < now) {
                targetTime.setDate(targetTime.getDate() + 1);
            }
            
            return Math.max(0, Math.floor((targetTime - now) / 60000));
        } catch (error) {
            console.error('Error calculating minutes from time:', error.message);
            return 0;
        }
    }

    /**
     * Estimate travel time between stations.
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @returns {number} Estimated travel time in minutes
     */
    _estimateTravelTime(origin, destination) {
        // Simple estimation: 3 minutes per station + base travel time
        const stationDistance = Math.abs(this._hashString(origin) % 10) + 2;
        return Math.max(5, stationDistance * 3);
    }

    /**
     * Clean up resources.
     */
    async cleanup() {
        await this._closeBrowser();
        this.cache.clear();
    }
}

module.exports = PlaywrightRushScraper;