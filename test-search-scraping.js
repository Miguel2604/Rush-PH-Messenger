#!/usr/bin/env node

require('dotenv').config();

// Enable debug screenshots
process.env.DEBUG_SCREENSHOTS = 'true';

const PlaywrightRushScraper = require('./src/scraper/playwright-rush-scraper');

async function testSearchScraping() {
    console.log('🔍 Testing Search-Based Scraping\n');
    console.log('This will:');
    console.log('1. Navigate to rush-ph.com');
    console.log('2. Use search bar to find station');
    console.log('3. Click on search result');
    console.log('4. Extract schedule data from dashboard');
    console.log('5. Take screenshot for debugging\n');

    const scraper = new PlaywrightRushScraper({ 
        useBrowser: true,
        browserType: 'chromium' // or 'firefox', 'webkit' for testing different engines
    });
    
    try {
        console.log('📋 Testing with Ayala → Buendia (MRT-3)...\n');
        
        const result = await scraper.scrapeTrainSchedule('Ayala', 'Buendia', 'MRT-3');
        
        console.log('\n' + '='.repeat(60));
        console.log('EXTRACTION RESULTS');
        console.log('='.repeat(60));
        
        if (result && !result.simulated) {
            console.log('✅ SUCCESS! Found real schedule data via search:');
            console.log(`Source: ${result.source}`);
            console.log(`Line: ${result.line}`);
            console.log(`Station: ${result.origin}`);
            console.log(`Next trains: ${result.nextTrains?.length || 0}`);
            
            if (result.extractionDetails) {
                console.log('\nExtraction details:');
                console.log(`- Selectors used: ${result.extractionDetails.selectorsUsed}`);
                console.log(`- Total found: ${result.extractionDetails.totalFound}`);
                console.log(`- Unique returned: ${result.extractionDetails.uniqueReturned}`);
            }
            
            if (result.nextTrains && result.nextTrains.length > 0) {
                console.log('\n📊 Extracted train times:');
                result.nextTrains.forEach((train, index) => {
                    console.log(`${index + 1}. ${train.time} (${train.minutesAway} min) - ${train.status}`);
                    if (train.direction) console.log(`   Direction: ${train.direction}`);
                    if (train.extractedFrom) console.log(`   Found via: ${train.extractedFrom}`);
                    if (train.context) console.log(`   Context: ${train.context.substring(0, 50)}...`);
                });
            }
        } else if (result && result.simulated) {
            console.log('⚠️  Still using simulated data');
            console.log('This means search did not reveal schedule data on the page');
            console.log('\nPossible reasons:');
            console.log('- Search functionality has changed');
            console.log('- Schedule data appears in different format');  
            console.log('- Additional interactions needed after search');
            console.log('- Dashboard requires more time to load');
        } else {
            console.log('❌ No data extracted');
        }
        
        if (result?.nextTrains?.length > 0) {
            console.log(`\n🚆 First train: ${result.nextTrains[0].time} (${result.nextTrains[0].minutesAway} min away)`);
        }
        
        console.log('\n📷 Check debug-rush-ph-playwright-*.png to see page states');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testSearchScraping().catch(console.error);