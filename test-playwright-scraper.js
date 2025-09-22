#!/usr/bin/env node

/**
 * Quick test for the new Playwright-based scraper.
 * This will test the improved search and dropdown functionality.
 */

require('dotenv').config();

// Enable debug screenshots to see what Playwright captures
process.env.DEBUG_SCREENSHOTS = 'true';

const PlaywrightRushScraper = require('./src/scraper/playwright-rush-scraper');

async function testPlaywrightScraper() {
    console.log('🎭 Testing New Playwright-Based Rush Scraper\n');
    console.log('This improved scraper will:');
    console.log('1. Navigate to rush-ph.com with better browser settings');
    console.log('2. Select the appropriate train line');
    console.log('3. Use enhanced search with proper dropdown handling');
    console.log('4. Wait for train data to load properly');  
    console.log('5. Extract schedule data with improved selectors');
    console.log('6. Save debugging screenshots\n');

    const scraper = new PlaywrightRushScraper({ 
        useBrowser: true,
        browserType: 'chromium' // Can test with 'firefox' or 'webkit' too
    });
    
    try {
        console.log('📋 Testing with Ayala → Buendia (MRT-3)...\n');
        
        const result = await scraper.scrapeTrainSchedule('Ayala', 'Buendia', 'MRT-3');
        
        console.log('\n' + '='.repeat(60));
        console.log('🎭 PLAYWRIGHT SCRAPING RESULTS');
        console.log('='.repeat(60));
        
        if (result && !result.simulated) {
            console.log('✅ SUCCESS! Playwright extracted real schedule data:');
            console.log(`📍 Source: ${result.source}`);
            console.log(`🚆 Line: ${result.line}`);
            console.log(`🏃 From: ${result.origin}`);
            console.log(`📍 To: ${result.destination}`);
            console.log(`🕐 Next trains: ${result.nextTrains?.length || 0}`);
            
            if (result.extractionDetails) {
                console.log('\n📊 Extraction details:');
                console.log(`- Selectors used: ${result.extractionDetails.selectorsUsed}`);
                console.log(`- Total found: ${result.extractionDetails.totalFound}`);
                console.log(`- Unique returned: ${result.extractionDetails.uniqueReturned}`);
            }
            
            if (result.nextTrains && result.nextTrains.length > 0) {
                console.log('\n🚊 Extracted train times:');
                result.nextTrains.forEach((train, index) => {
                    console.log(`${index + 1}. ${train.time} (${train.minutesAway} min) - ${train.status}`);
                    if (train.direction) console.log(`   📍 Direction: ${train.direction}`);
                    if (train.extractedFrom) console.log(`   🔍 Found via: ${train.extractedFrom}`);
                    if (train.context) console.log(`   📝 Context: ${train.context.substring(0, 50)}...`);
                });
            }
            
            console.log('\n🎯 This means the search dropdown was properly handled!');
            
        } else if (result && result.simulated) {
            console.log('⚠️  Still using simulated data');
            console.log('Possible reasons:');
            console.log('- Search dropdown did not appear or was not clickable');
            console.log('- Train data takes longer to load than expected');
            console.log('- Page structure has changed since implementation');
            console.log('- Different train line button behavior');
            console.log('\n💡 Check the debug screenshots to see what happened');
            
        } else {
            console.log('❌ No data extracted at all');
            console.log('This suggests a fundamental issue with page navigation or DOM access');
        }
        
        if (result?.nextTrains?.length > 0) {
            console.log(`\n🚆 Next train: ${result.nextTrains[0].time} (${result.nextTrains[0].minutesAway} min away)`);
            console.log(`⏱️  Travel time estimate: ${result.estimatedTravelTime} minutes`);
        }
        
        console.log('\n📸 Debug Screenshots:');
        console.log('- debug-rush-ph-playwright-initial.png (page after load)');
        console.log('- debug-rush-ph-playwright-after-search.png (after station search)');
        
        // Clean up
        await scraper.cleanup();
        console.log('\n🧹 Browser cleaned up successfully');
        
    } catch (error) {
        console.error('❌ Playwright test failed:', error.message);
        console.error(error.stack);
        
        // Still clean up on error
        try {
            await scraper.cleanup();
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError.message);
        }
    }
}

// Additional test with different station to verify robustness
async function testMultipleStations() {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 TESTING WITH MULTIPLE STATIONS');
    console.log('='.repeat(60));
    
    const testCases = [
        { origin: 'Taft Avenue', destination: 'Cubao', line: 'LRT-1' },
        { origin: 'Fernando Poe Jr.', destination: 'Monumento', line: 'LRT-1' },
        { origin: 'Recto', destination: 'Santolan', line: 'LRT-2' }
    ];
    
    const scraper = new PlaywrightRushScraper({ 
        useBrowser: true,
        browserType: 'chromium'
    });
    
    for (const testCase of testCases) {
        console.log(`\n🧪 Testing: ${testCase.origin} → ${testCase.destination} (${testCase.line})`);
        
        try {
            const result = await scraper.scrapeTrainSchedule(
                testCase.origin, 
                testCase.destination, 
                testCase.line
            );
            
            const status = result && !result.simulated ? '✅ REAL DATA' : '🎭 SIMULATED';
            const trainCount = result?.nextTrains?.length || 0;
            console.log(`   Result: ${status} - ${trainCount} trains found`);
            
        } catch (error) {
            console.log(`   Result: ❌ ERROR - ${error.message}`);
        }
    }
    
    await scraper.cleanup();
    console.log('\n✅ Multi-station test complete');
}

// Run the tests
async function runAllTests() {
    await testPlaywrightScraper();
    
    // Optionally test multiple stations (commented out to avoid too many requests)
    // await testMultipleStations();
    
    console.log('\n🎉 All tests completed!');
}

runAllTests().catch(console.error);