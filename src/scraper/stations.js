/**
 * Station data management and validation for Philippine train systems.
 */

class StationManager {
    /**
     * Initialize station data for all train lines.
     */
    constructor() {
        this.stations = {
            "MRT-3": [
                "North Avenue", "Quezon Avenue", "GMA-Kamuning", "Cubao", "Santolan-Annapolis",
                "Ortigas", "Shaw Boulevard", "Boni", "Guadalupe", "Buendia", "Ayala", "Magallanes", "Taft Avenue"
            ],
            "LRT-1": [
                "Roosevelt", "Balintawak", "Monumento", "5th Avenue", "R. Papa", "Abad Santos",
                "Blumentritt", "Tayuman", "Bambang", "Doroteo Jose", "Carriedo", "Central Terminal",
                "United Nations", "Pedro Gil", "Quirino", "Vito Cruz", "Gil Puyat", "Libertad",
                "EDSA", "Baclaran"
            ],
            "LRT-2": [
                "Antipolo", "Marikina", "Santolan", "Katipunan", "Anonas", "Cubao", "Betty Go-Belmonte",
                "Gilmore", "J. Ruiz", "V. Mapa", "Pureza", "Legarda", "Recto"
            ]
        };

        // Create reverse mapping for quick line lookup
        this.stationToLine = {};
        for (const [line, stationList] of Object.entries(this.stations)) {
            for (const station of stationList) {
                this.stationToLine[station.toLowerCase()] = line;
            }
        }
    }

    /**
     * Get list of all station names across all lines.
     * @returns {string[]} Array of all station names
     */
    getAllStations() {
        const allStations = [];
        for (const stationList of Object.values(this.stations)) {
            allStations.push(...stationList);
        }
        return allStations;
    }

    /**
     * Get stations for a specific line.
     * @param {string} line - Train line name
     * @returns {string[]} Array of station names for the line
     */
    getLineStations(line) {
        return this.stations[line] || [];
    }

    /**
     * Find which line a station belongs to.
     * @param {string} stationName - Station name to look up
     * @returns {string|null} Line name or null if not found
     */
    findStationLine(stationName) {
        return this.stationToLine[stationName.toLowerCase()] || null;
    }

    /**
     * Validate and normalize station input.
     * @param {string} stationInput - User input station name
     * @returns {string|null} Proper station name if found, null otherwise
     */
    validateStation(stationInput) {
        const cleanInput = stationInput.trim();
        const allStations = this.getAllStations();

        // Exact match (case insensitive)
        for (const station of allStations) {
            if (station.toLowerCase() === cleanInput.toLowerCase()) {
                return station;
            }
        }

        // Partial match
        for (const station of allStations) {
            if (cleanInput.toLowerCase().includes(station.toLowerCase()) || 
                station.toLowerCase().includes(cleanInput.toLowerCase())) {
                return station;
            }
        }

        return null;
    }

    /**
     * Get station name suggestions based on input.
     * @param {string} stationInput - User input
     * @param {number} maxSuggestions - Maximum number of suggestions
     * @returns {string[]} Array of suggested station names
     */
    getStationSuggestions(stationInput, maxSuggestions = 3) {
        const allStations = this.getAllStations();
        const suggestions = [];
        
        // Simple string similarity matching
        for (const station of allStations) {
            const similarity = this._calculateSimilarity(stationInput.toLowerCase(), station.toLowerCase());
            if (similarity > 0.3) {
                suggestions.push({ station, similarity });
            }
        }

        // Sort by similarity and return top matches
        suggestions.sort((a, b) => b.similarity - a.similarity);
        return suggestions.slice(0, maxSuggestions).map(s => s.station);
    }

    /**
     * Calculate simple string similarity (Levenshtein distance based).
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Similarity score between 0 and 1
     */
    _calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const distance = this._levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    /**
     * Calculate Levenshtein distance between two strings.
     */
    _levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Get route information between two stations.
     * @param {string} origin - Origin station name
     * @param {string} destination - Destination station name
     * @returns {object|null} Route information or null if invalid
     */
    getRouteInfo(origin, destination) {
        const originLine = this.findStationLine(origin);
        const destinationLine = this.findStationLine(destination);

        if (!originLine || !destinationLine) {
            return null;
        }

        // Same line route
        if (originLine === destinationLine) {
            const lineStations = this.getLineStations(originLine);
            try {
                const originIdx = lineStations.indexOf(origin);
                const destIdx = lineStations.indexOf(destination);

                if (originIdx === destIdx) {
                    return null; // Same station
                }

                return {
                    line: originLine,
                    origin: origin,
                    destination: destination,
                    originIndex: originIdx,
                    destinationIndex: destIdx,
                    direction: destIdx < originIdx ? 'northbound' : 'southbound',
                    stationsBetween: Math.abs(destIdx - originIdx),
                    transferRequired: false
                };
            } catch (error) {
                return null;
            }
        }

        // Inter-line route (requires transfer)
        return {
            line: `${originLine} → ${destinationLine}`,
            origin: origin,
            destination: destination,
            transferRequired: true,
            originLine: originLine,
            destinationLine: destinationLine
        };
    }

    /**
     * Check if a route between two stations is valid.
     * @param {string} origin - Origin station
     * @param {string} destination - Destination station
     * @returns {boolean} True if route is valid
     */
    isValidRoute(origin, destination) {
        return this.getRouteInfo(origin, destination) !== null;
    }
}

module.exports = StationManager;