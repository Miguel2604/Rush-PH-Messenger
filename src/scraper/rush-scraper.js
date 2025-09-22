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
            
            // Take a screenshot for debugging (optional)
            if (process.env.DEBUG_SCREENSHOTS === 'true') {
                await page.screenshot({ path: 'debug-rush-ph.png', fullPage: true });
                console.log('📷 Debug screenshot saved as debug-rush-ph.png');
            }
            
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
     * Try to interact with station selectors on rush-ph.com.
     * @param {object} page - Puppeteer page object
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @returns {Promise<boolean>} True if selectors were found and used
     */
    async _tryStationSelection(page, origin, destination) {
        try {
            console.log('🔍 Looking for rush-ph.com search functionality...');
            
            // Method 1: Try using the search bar (this is the correct way!)
            const searchSuccess = await this._useSearchBar(page, origin);
            if (searchSuccess) {
                console.log('✅ Successfully used search to find station data');
                return true;
            }
            
            // Method 2: Fallback to old button clicking approach
            console.log('🔄 Search failed, trying button selection fallback...');
            
            // Step 1: Look for line selection buttons (LRT-1, MRT-3, LRT-2, PNR)
            const lineSelected = await this._selectTrainLine(page, origin);
            if (!lineSelected) {
                console.log('❌ No train line buttons found');
                return false;
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Step 2: Look for station buttons with rush-ph.com styling
            const stationSelected = await this._selectStation(page, origin);
            if (!stationSelected) {
                console.log('❌ Station selection failed');
                return false;
            }
            
            console.log('✅ Successfully navigated rush-ph.com interface via buttons');
            return true;
            
        } catch (error) {
            console.error('Error in rush-ph.com station selection:', error.message);
            return false;
        }
    }
    
    /**
     * Use the search bar to find station schedule data.
     * @param {object} page - Puppeteer page object
     * @param {string} stationName - Station name to search for
     * @returns {Promise<boolean>} True if search was successful
     */
    async _useSearchBar(page, stationName) {
        try {
            console.log(`🔎 Searching for station: ${stationName}`);
            
            // Look for search input field with various possible selectors
            const searchSelectors = [
                'input[type="search"]',
                'input[placeholder*="search"]',
                'input[placeholder*="Search"]', 
                'input[placeholder*="station"]',
                'input[placeholder*="Station"]',
                '[data-testid="search"]',
                '[data-testid="search-input"]',
                '.search-input',
                '#search',
                '#search-input',
                'input[class*="search"]',
                'input' // Generic fallback
            ];
            
            let searchInput = null;
            for (const selector of searchSelectors) {
                try {
                    const elements = await page.$$(selector);
                    if (elements.length > 0) {
                        // Try to find a visible input
                        for (const element of elements) {
                            const isVisible = await element.isVisible();
                            if (isVisible) {
                                searchInput = element;
                                console.log(`🎯 Found search input with selector: ${selector}`);
                                break;
                            }
                        }
                        if (searchInput) break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            if (!searchInput) {
                console.log('❌ No search input found');
                return false;
            }
            
            // Clear and type in the search input
            await searchInput.click();
            await searchInput.focus();
            
            // Clear any existing text
            await page.keyboard.down('Control');
            await page.keyboard.press('KeyA');
            await page.keyboard.up('Control');
            
            // Type the station name
            await searchInput.type(stationName, { delay: 100 });
            console.log(`✍️ Typed "${stationName}" in search box`);
            
            // Wait for search results to appear
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Look for search results/suggestions
            const resultSelectors = [
                '[data-testid*="result"]',
                '[data-testid*="suggestion"]',
                '.search-result',
                '.search-suggestion',
                '.dropdown-item',
                '.suggestion',
                '.result',
                '[role="option"]',
                'li[class*="search"]',
                'div[class*="search"]',
                'button[class*="search"]'
            ];
            
            let resultClicked = false;
            for (const selector of resultSelectors) {
                try {
                    const results = await page.$$(selector);
                    console.log(`Found ${results.length} potential results for selector: ${selector}`);
                    
                    for (const result of results) {
                        const text = await result.evaluate(el => el.textContent?.trim());
                        console.log(`Result text: "${text}"`);
                        
                        // Check if this result matches our station
                        if (text && text.toLowerCase().includes(stationName.toLowerCase())) {
                            console.log(`🎯 Clicking matching result: "${text}"`);
                            await result.click();
                            resultClicked = true;
                            break;
                        }
                    }
                    if (resultClicked) break;
                } catch (e) {
                    console.log(`Error checking results for ${selector}:`, e.message);
                }
            }
            
            if (!resultClicked) {
                // Try pressing Enter if no results to click
                console.log('🔄 No clickable results found, trying Enter key...');
                await page.keyboard.press('Enter');
            }
            
            // Wait for the dashboard/schedule data to load
            console.log('⏳ Waiting for schedule data to load...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            return true;
            
        } catch (error) {
            console.error('Error using search bar:', error.message);
            return false;
        }
    }
    
    /**
     * Select train line on rush-ph.com.
     * @param {object} page - Puppeteer page object
     * @param {string} station - Station name to determine line
     * @returns {Promise<boolean>} True if line was selected
     */
    async _selectTrainLine(page, station) {
        try {
            // Determine which line this station belongs to
            const StationManager = require('./stations');
            const stationManager = new StationManager();
            const line = stationManager.findStationLine(station);
            
            if (!line) {
                console.log(`❌ Unknown line for station: ${station}`);
                return false;
            }
            
            console.log(`🚆 Selecting line: ${line}`);
            
            // Look for line button with specific styling
            const lineButtonSelected = await page.evaluate((targetLine) => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const lineButton = buttons.find(btn => {
                    const text = btn.textContent?.trim();
                    return text === targetLine;
                });
                
                if (lineButton) {
                    lineButton.click();
                    return true;
                }
                return false;
            }, line);
            
            if (lineButtonSelected) {
                console.log(`✅ Successfully selected ${line}`);
                return true;
            } else {
                console.log(`❌ Could not find ${line} button`);
                return false;
            }
            
        } catch (error) {
            console.error('Error selecting train line:', error.message);
            return false;
        }
    }
    
    /**
     * Select station button on rush-ph.com.
     * @param {object} page - Puppeteer page object
     * @param {string} stationName - Station name to select
     * @returns {Promise<boolean>} True if station was selected
     */
    async _selectStation(page, stationName) {
        try {
            console.log(`🚉 Looking for station: ${stationName}`);
            
            // Look for station buttons with rush-ph.com specific styling
            const stationSelected = await page.evaluate((targetStation) => {
                const buttons = Array.from(document.querySelectorAll('button'));
                
                // Find station button by text content and styling
                const stationButton = buttons.find(btn => {
                    const text = btn.textContent?.trim();
                    const classes = btn.className || '';
                    
                    // Check if it matches rush-ph.com station button styling
                    const hasStationStyling = classes.includes('w-full') && 
                                            classes.includes('text-left') && 
                                            classes.includes('px-4') && 
                                            classes.includes('py-3');
                    
                    return text === targetStation && hasStationStyling;
                });
                
                if (stationButton) {
                    stationButton.click();
                    return true;
                }
                
                // Fallback: try partial matching
                const partialMatch = buttons.find(btn => {
                    const text = btn.textContent?.trim() || '';
                    const classes = btn.className || '';
                    const hasStationStyling = classes.includes('w-full') && classes.includes('text-left');
                    
                    return text.toLowerCase().includes(targetStation.toLowerCase()) && hasStationStyling;
                });
                
                if (partialMatch) {
                    partialMatch.click();
                    return true;
                }
                
                return false;
            }, stationName);
            
            if (stationSelected) {
                console.log(`✅ Successfully selected station: ${stationName}`);
                
                // Wait for any content to load after station selection
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                return true;
            } else {
                console.log(`❌ Could not find station button: ${stationName}`);
                return false;
            }
            
        } catch (error) {
            console.error('Error selecting station:', error.message);
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
            
            // Wait a bit more for dynamic content to load
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Enhanced extraction to find visible train schedule data on rush-ph.com
            const scheduleData = await page.evaluate((orig, dest, trainLine) => {
                console.log('Looking for schedule data on page...');
                
                // Rush-ph.com specific selectors (based on common React/Tailwind patterns)
                const selectors = [
                    // Time display elements
                    '[class*="time"]',
                    '[class*="schedule"]',
                    '[class*="train"]',
                    '[class*="departure"]',
                    '[class*="arrival"]',
                    '[class*="eta"]',
                    '[class*="next"]',
                    
                    // Common React component patterns
                    '[data-testid*="time"]',
                    '[data-testid*="schedule"]',
                    '[data-testid*="train"]',
                    
                    // List and table patterns
                    'table, .schedule, .timetable, .train-times',
                    'ul, ol, .train-list, .departure-times',
                    '.card, .schedule-card, .train-card',
                    
                    // Tailwind/modern CSS patterns
                    '.bg-white, .bg-gray-100, .bg-blue-50',
                    '.p-4, .p-6, .px-4, .py-2',
                    '.flex, .grid',
                    '.rounded, .rounded-lg, .shadow',
                    
                    // Text content that might contain times
                    'div, span, p, li, td'
                ];
                
                const trainTimes = [];
                const processedTimes = new Set();
                
                // Search through all potential elements
                for (const selector of selectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        console.log(`Found ${elements.length} elements for selector: ${selector}`);
                        
                        for (const element of elements) {
                            const text = element.textContent || '';
                            const innerHTML = element.innerHTML || '';
                            
                            // Look for time patterns (HH:MM in 24-hour or 12-hour format)
                            const timePatterns = [
                                /\\b(\\d{1,2}:\\d{2})\\s*(AM|PM)?\\b/gi,  // 12-hour format
                                /\\b(\\d{1,2}:\\d{2})\\b/g,               // 24-hour format
                                /\\b(\\d{1,2}\\.\\d{2})\\b/g,               // European format
                            ];
                            
                            for (const pattern of timePatterns) {
                                const matches = text.match(pattern);
                                if (matches) {
                                    matches.forEach(match => {
                                        const cleanTime = match.trim();
                                        // Simple time validation
                                        const isValidTime = (timeStr) => {
                                            const cleanTime = timeStr.replace(/[AP]M/gi, '').trim();
                                            const timeParts = cleanTime.split(/[:.:]/);
                                            if (timeParts.length !== 2) return false;
                                            
                                            const hours = parseInt(timeParts[0]);
                                            const minutes = parseInt(timeParts[1]);
                                            
                                            return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
                                        };
                                        
                                        if (!processedTimes.has(cleanTime) && isValidTime(cleanTime)) {
                                            processedTimes.add(cleanTime);
                                            
                                            // Try to extract additional context from surrounding elements
                                            const parent = element.parentElement;
                                            const siblings = parent ? Array.from(parent.children) : [];
                                            
                                            let status = 'On Time';
                                            let minutesAway = null;
                                            let direction = null;
                                            
                                            // Look for status indicators
                                            siblings.forEach(sibling => {
                                                const siblingText = sibling.textContent?.toLowerCase() || '';
                                                if (siblingText.includes('delay')) status = 'Delayed';
                                                if (siblingText.includes('cancel')) status = 'Cancelled';
                                                if (siblingText.includes('on time')) status = 'On Time';
                                                
                                                // Look for minutes away
                                                const minutesMatch = siblingText.match(/(\\d+)\\s*min/);
                                                if (minutesMatch) {
                                                    minutesAway = parseInt(minutesMatch[1]);
                                                }
                                                
                                                // Look for direction info
                                                if (siblingText.includes('north') || siblingText.includes('up')) {
                                                    direction = 'Northbound';
                                                }
                                                if (siblingText.includes('south') || siblingText.includes('down')) {
                                                    direction = 'Southbound';
                                                }
                                            });
                                            
                                            trainTimes.push({
                                                time: cleanTime,
                                                minutesAway: minutesAway || 0,
                                                status: status,
                                                direction: direction,
                                                extractedFrom: selector,
                                                context: text.substring(0, 100)
                                            });
                                        }
                                    });
                                }
                            }
                        }
                    } catch (e) {
                        console.log(`Error with selector ${selector}:`, e.message);
                    }
                }
                
                // Also check for any visible text that looks like schedule info
                const bodyText = document.body.textContent || '';
                console.log('Page text preview:', bodyText.substring(0, 500));
                
                // Check for React component state or props that might contain data
                const reactElements = document.querySelectorAll('[data-reactroot], [data-react-class]');
                console.log(`Found ${reactElements.length} React elements`);
                
                // Look for any elements that contain numbers that could be times
                const numberElements = Array.from(document.querySelectorAll('*')).filter(el => {
                    const text = el.textContent || '';
                    return /\\d{1,2}:\\d{2}/.test(text) && el.children.length === 0; // Leaf nodes only
                });
                
                console.log(`Found ${numberElements.length} elements with time-like patterns`);
                numberElements.slice(0, 10).forEach(el => {
                    console.log('Time-like element:', el.textContent, el.className);
                });
                
                console.log(`Total train times extracted: ${trainTimes.length}`);
                
                if (trainTimes.length > 0) {
                    // Sort by time and remove duplicates
                    const uniqueTimes = trainTimes.filter((time, index, self) => 
                        index === self.findIndex(t => t.time === time.time)
                    );
                    
                    return {
                        line: trainLine,
                        origin: orig,
                        destination: dest,
                        nextTrains: uniqueTimes.slice(0, 8), // Get more trains
                        extractedAt: new Date().toISOString(),
                        simulated: false,
                        source: 'dom-extraction',
                        extractionDetails: {
                            selectorsUsed: selectors.length,
                            elementsFound: trainTimes.length,
                            uniqueTimes: uniqueTimes.length
                        }
                    };
                }
                
                return null;
            }, origin, destination, line);
            
            if (scheduleData && scheduleData.nextTrains && scheduleData.nextTrains.length > 0) {
                // Calculate minutes away for times that don't have it
                scheduleData.nextTrains = scheduleData.nextTrains.map(train => {
                    if (train.minutesAway === 0 || train.minutesAway === null) {
                        train.minutesAway = this._calculateMinutesFromTime(train.time);
                    }
                    return train;
                });
                
                scheduleData.estimatedTravelTime = this._estimateTravelTime(origin, destination);
                scheduleData.lastUpdated = new Date().toISOString();
                scheduleData.status = 'operational';
                
                console.log(`✅ Extracted ${scheduleData.nextTrains.length} train times from DOM`);
                console.log('Sample extracted data:', scheduleData.nextTrains.slice(0, 2));
                return scheduleData;
            }
            
            console.log('❌ No schedule data found in DOM');
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
     * Intercept network requests for rush-ph.com API data.
     * @param {object} page - Puppeteer page object
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {Promise<object|null>} Network data
     */
    async _interceptNetworkData(page, origin, destination, line) {
        try {
            console.log('🌐 Setting up rush-ph.com network interception...');
            
            const apiCalls = [];
            
            // Listen for rush-ph.com specific API responses
            page.on('response', async (response) => {
                const url = response.url();
                
                // Target rush-ph.com specific endpoints
                if (url.includes('.netlify/functions/api-proxy') || 
                    url.includes('supabase.co') ||
                    url.includes('rush-ph.com') && (url.includes('api') || url.includes('train') || url.includes('schedule'))) {
                    
                    try {
                        const contentType = response.headers()['content-type'] || '';
                        if (contentType.includes('json')) {
                            const data = await response.json();
                            apiCalls.push({
                                url: url,
                                status: response.status(),
                                data: data,
                                timestamp: new Date().toISOString()
                            });
                            console.log(`📶 Captured API call: ${url}`);
                        }
                    } catch (e) {
                        console.log(`📶 Non-JSON response from: ${url}`);
                    }
                }
            });
            
            // Try to trigger schedule-related API calls by navigating the interface
            console.log('🔎 Attempting to trigger schedule API calls...');
            
            // Method 1: Try clicking around to trigger API calls
            await this._triggerScheduleAPICalls(page, origin, line);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Method 2: Try direct API proxy calls if we can determine the format
            await this._tryDirectAPIProxy(page, origin, destination, line);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            console.log(`📡 Captured ${apiCalls.length} API calls`);
            
            // Process captured API calls
            for (const call of apiCalls) {
                const processedData = this._processRawData(call.data, origin, destination, line);
                if (processedData) {
                    console.log('✅ Successfully processed API data');
                    return processedData;
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error intercepting network data:', error.message);
            return null;
        }
    }
    
    /**
     * Try to trigger schedule-related API calls.
     * @param {object} page - Puppeteer page object
     * @param {string} station - Station name
     * @param {string} line - Train line
     */
    async _triggerScheduleAPICalls(page, station, line) {
        try {
            // Try to interact with elements that might trigger API calls
            await page.evaluate(() => {
                // Look for refresh buttons or update buttons
                const refreshButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                    const text = btn.textContent?.toLowerCase() || '';
                    return text.includes('refresh') || text.includes('update') || text.includes('reload');
                });
                
                refreshButtons.forEach(btn => {
                    try { btn.click(); } catch (e) {}
                });
                
                // Try to trigger any data loading by scrolling or interacting
                window.scrollTo(0, 100);
                window.scrollTo(0, 0);
            });
            
        } catch (error) {
            console.log('Error triggering API calls:', error.message);
        }
    }
    
    /**
     * Try direct API proxy calls to rush-ph.com.
     * @param {object} page - Puppeteer page object
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     */
    async _tryDirectAPIProxy(page, origin, destination, line) {
        try {
            console.log('🌐 Attempting direct API proxy calls...');
            
            // Try to make direct API calls using the page's fetch
            await page.evaluate(async (orig, dest, trainLine) => {
                const apiActions = [
                    'trains.fetch',
                    'schedules.fetch', 
                    'stations.fetch',
                    'realtime.fetch',
                    'departures.fetch'
                ];
                
                for (const action of apiActions) {
                    try {
                        const response = await fetch('/.netlify/functions/api-proxy?action=' + action, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                origin: orig,
                                destination: dest,
                                line: trainLine,
                                station: orig
                            })
                        });
                        
                        if (response.ok) {
                            console.log(`API call successful: ${action}`);
                        }
                    } catch (e) {
                        console.log(`API call failed: ${action}`);
                    }
                }
            }, origin, destination, line);
            
        } catch (error) {
            console.log('Error with direct API calls:', error.message);
        }
    }
    
    /**
     * Process raw data from rush-ph.com API responses.
     * @param {object} rawData - Raw data object from API
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {object|null} Processed schedule data
     */
    _processRawData(rawData, origin, destination, line) {
        try {
            console.log('🔄 Processing raw data from rush-ph.com API...');
            
            if (!rawData || typeof rawData !== 'object') {
                return null;
            }
            
            // Handle different API response formats from rush-ph.com
            
            // Format 1: Direct train/schedule data
            if (rawData.trains || rawData.schedules || rawData.departures) {
                return this._processTrainScheduleData(rawData, origin, destination, line);
            }
            
            // Format 2: Supabase response format
            if (rawData.data && Array.isArray(rawData.data)) {
                return this._processSupabaseData(rawData, origin, destination, line);
            }
            
            // Format 3: Nested data structure
            if (rawData.result || rawData.response) {
                const nestedData = rawData.result || rawData.response;
                return this._processRawData(nestedData, origin, destination, line);
            }
            
            // Format 4: Weather/status data that might contain train info
            if (rawData.weather || rawData.status) {
                return this._processStatusData(rawData, origin, destination, line);
            }
            
            // Format 5: Real-time updates
            if (rawData.realtime || rawData.live) {
                return this._processRealTimeData(rawData, origin, destination, line);
            }
            
            // Format 6: Generic data with time patterns
            return this._extractTimeDataFromGeneric(rawData, origin, destination, line);
            
        } catch (error) {
            console.error('Error processing raw data:', error.message);
            return null;
        }
    }
    
    /**
     * Process train schedule data format.
     * @param {object} data - Train schedule data
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {object|null} Processed data
     */
    _processTrainScheduleData(data, origin, destination, line) {
        try {
            const trainData = data.trains || data.schedules || data.departures || [];
            const trainTimes = [];
            
            // Handle array of train data
            if (Array.isArray(trainData)) {
                trainData.forEach(train => {
                    const time = this._extractTimeFromObject(train);
                    const status = train.status || train.state || 'Unknown';
                    const delay = train.delay || train.delayMinutes || 0;
                    
                    if (time) {
                        trainTimes.push({
                            time: time,
                            minutesAway: this._calculateMinutesFromTime(time),
                            status: delay > 0 ? 'Delayed' : 'On Time',
                            delay: delay
                        });
                    }
                });
            }
            
            if (trainTimes.length > 0) {
                console.log(`✅ Processed ${trainTimes.length} train times from API data`);
                return {
                    line: line,
                    origin: origin,
                    destination: destination,
                    nextTrains: trainTimes.slice(0, 5),
                    estimatedTravelTime: this._estimateTravelTime(origin, destination),
                    lastUpdated: new Date().toISOString(),
                    status: 'operational',
                    simulated: false,
                    source: 'rush-ph.com-api'
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error processing train schedule data:', error.message);
            return null;
        }
    }
    
    /**
     * Process Supabase response format.
     * @param {object} data - Supabase response
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {object|null} Processed data
     */
    _processSupabaseData(data, origin, destination, line) {
        try {
            const records = data.data || [];
            const trainTimes = [];
            
            records.forEach(record => {
                // Common Supabase fields for train data
                const time = record.departure_time || record.arrival_time || record.time || record.scheduled_time;
                const station = record.station || record.station_name;
                const trainLine = record.line || record.train_line;
                const status = record.status || record.state || 'On Time';
                
                // Check if this record is relevant to our query
                if (time && (!station || station.toLowerCase().includes(origin.toLowerCase()))) {
                    trainTimes.push({
                        time: this._normalizeTimeFormat(time),
                        minutesAway: this._calculateMinutesFromTime(time),
                        status: status,
                        line: trainLine || line
                    });
                }
            });
            
            if (trainTimes.length > 0) {
                console.log(`✅ Processed ${trainTimes.length} train times from Supabase data`);
                return {
                    line: line,
                    origin: origin,
                    destination: destination,
                    nextTrains: trainTimes.slice(0, 5),
                    estimatedTravelTime: this._estimateTravelTime(origin, destination),
                    lastUpdated: new Date().toISOString(),
                    status: 'operational',
                    simulated: false,
                    source: 'supabase-api'
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error processing Supabase data:', error.message);
            return null;
        }
    }
    
    /**
     * Process status/weather data that might contain train information.
     * @param {object} data - Status data
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {object|null} Processed data
     */
    _processStatusData(data, origin, destination, line) {
        try {
            // Check if status data contains train disruptions or schedules
            if (data.trains || data.services || data.lines) {
                const serviceData = data.trains || data.services || data.lines;
                return this._processTrainScheduleData({ trains: serviceData }, origin, destination, line);
            }
            
            // Check weather impact on services
            if (data.weather && data.weather.impact) {
                console.log('🌧️ Weather impact detected, adjusting simulated data');
                // Could adjust timing based on weather conditions
            }
            
            return null;
        } catch (error) {
            console.error('Error processing status data:', error.message);
            return null;
        }
    }
    
    /**
     * Process real-time data.
     * @param {object} data - Real-time data
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {object|null} Processed data
     */
    _processRealTimeData(data, origin, destination, line) {
        try {
            const realtimeData = data.realtime || data.live || data;
            
            // Handle real-time updates format
            if (realtimeData.updates || realtimeData.departures || realtimeData.arrivals) {
                const updates = realtimeData.updates || realtimeData.departures || realtimeData.arrivals;
                return this._processTrainScheduleData({ trains: updates }, origin, destination, line);
            }
            
            return null;
        } catch (error) {
            console.error('Error processing real-time data:', error.message);
            return null;
        }
    }
    
    /**
     * Extract time data from generic object structure.
     * @param {object} data - Generic data object
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @param {string} line - Train line
     * @returns {object|null} Processed data
     */
    _extractTimeDataFromGeneric(data, origin, destination, line) {
        try {
            const dataStr = JSON.stringify(data);
            
            // Look for time patterns in the entire data structure
            const timePatterns = [
                /\b(\d{1,2}:\d{2})\b/g,  // HH:MM format
                /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\b/g,  // ISO timestamp
                /"time"\s*:\s*"([^"]+)"/g,  // JSON time field
                /"departure"\s*:\s*"([^"]+)"/g,  // JSON departure field
                /"arrival"\s*:\s*"([^"]+)"/g   // JSON arrival field
            ];
            
            const foundTimes = [];
            
            timePatterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(dataStr)) !== null) {
                    const timeStr = match[1];
                    if (this._isValidTimeString(timeStr)) {
                        foundTimes.push(timeStr);
                    }
                }
            });
            
            if (foundTimes.length > 0) {
                const uniqueTimes = [...new Set(foundTimes)];
                const trainTimes = uniqueTimes.slice(0, 5).map(time => ({
                    time: this._normalizeTimeFormat(time),
                    minutesAway: this._calculateMinutesFromTime(time),
                    status: 'On Time'
                }));
                
                console.log(`✅ Extracted ${trainTimes.length} time patterns from generic data`);
                return {
                    line: line,
                    origin: origin,
                    destination: destination,
                    nextTrains: trainTimes,
                    estimatedTravelTime: this._estimateTravelTime(origin, destination),
                    lastUpdated: new Date().toISOString(),
                    status: 'operational',
                    simulated: false,
                    source: 'extracted-patterns'
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error extracting generic time data:', error.message);
            return null;
        }
    }
    
    /**
     * Extract time from various object formats.
     * @param {object} obj - Object that might contain time
     * @returns {string|null} Time string or null
     */
    _extractTimeFromObject(obj) {
        const timeFields = ['time', 'departure_time', 'arrival_time', 'scheduled_time', 'eta', 'departure', 'arrival'];
        
        for (const field of timeFields) {
            if (obj[field]) {
                return obj[field];
            }
        }
        
        return null;
    }
    
    /**
     * Calculate minutes away from time string.
     * @param {string} timeStr - Time string
     * @returns {number} Minutes away from now
     */
    _calculateMinutesFromTime(timeStr) {
        try {
            const now = new Date();
            let targetTime;
            
            if (timeStr.includes('T')) {
                // ISO format
                targetTime = new Date(timeStr);
            } else if (timeStr.includes(':')) {
                // HH:MM format
                const [hours, minutes] = timeStr.split(':').map(Number);
                targetTime = new Date();
                targetTime.setHours(hours, minutes, 0, 0);
                
                // If time is in the past, assume it's for tomorrow
                if (targetTime < now) {
                    targetTime.setDate(targetTime.getDate() + 1);
                }
            } else {
                return 0;
            }
            
            return Math.max(0, Math.round((targetTime - now) / 60000));
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * Normalize time format to HH:MM.
     * @param {string} timeStr - Time string in various formats
     * @returns {string} Normalized time string
     */
    _normalizeTimeFormat(timeStr) {
        try {
            if (timeStr.includes('T')) {
                // ISO format
                return new Date(timeStr).toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    hour12: false 
                });
            } else if (timeStr.includes(':')) {
                // Already in HH:MM format, ensure 2-digit format
                const [hours, minutes] = timeStr.split(':');
                return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
            }
            
            return timeStr;
        } catch (error) {
            return timeStr;
        }
    }
    
    /**
     * Check if string is a valid time.
     * @param {string} str - String to check
     * @returns {boolean} True if valid time
     */
    _isValidTimeString(str) {
        return /^\d{1,2}:\d{2}$/.test(str) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str);
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