/**
 * @fileoverview A simple utility for client-side caching using localStorage.
 */

/**
 * Retrieves data from cache or fetches it if the cache is stale or non-existent.
 *
 * @param {string} cacheKey The unique key for this data in localStorage.
 * @param {function(): Promise<any>} fetchFunction An async function that fetches the data from the source (e.g., Firestore).
 * @param {number} [expirationMinutes=1440] The cache duration in minutes. Defaults to 24 hours (1440 minutes).
 * @returns {Promise<any>} A promise that resolves with the data.
 */
export async function getWithCache(cacheKey, fetchFunction, expirationMinutes = 1440) {
    const CACHE_EXPIRATION = expirationMinutes * 60 * 1000; // Convert minutes to milliseconds

    try {
        const cachedItem = localStorage.getItem(cacheKey);
        if (cachedItem) {
            const { data, timestamp } = JSON.parse(cachedItem);
            
            // Check if cache is still valid
            if (Date.now() - timestamp < CACHE_EXPIRATION) {
                console.log(`[Cache] Serving "${cacheKey}" from localStorage.`);
                return data;
            }
        }
    } catch (error) {
        console.error(`[Cache] Error reading cache for "${cacheKey}":`, error);
    }

    // If no valid cache, fetch new data
    console.log(`[Cache] Fetching new data for "${cacheKey}" from source.`);
    const newData = await fetchFunction();

    // Store the new data and timestamp in localStorage
    const itemToCache = {
        data: newData,
        timestamp: Date.now()
    };
    localStorage.setItem(cacheKey, JSON.stringify(itemToCache));

    return newData;
}
