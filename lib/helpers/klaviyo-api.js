const BASE_URL = "https://a.klaviyo.com/api/";
const REVISION = "2025-04-15";

/**
 * Returns the correct headers for Klaviyo API requests.
 * @param {string} apiKey
 */
function getKlaviyoHeaders(apiKey) {
    const headers = {
        revision: REVISION,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/json",
    };

    if (apiKey && apiKey.startsWith("pk_")) {
        headers["Authorization"] = `Klaviyo-API-Key ${apiKey}`;
    } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
    }

    return headers;
}

/**
 * Generic Klaviyo API request function.
 * @param {'GET'|'POST'|'PATCH'|'DELETE'} method
 * @param {string} endpoint - e.g. 'lists', 'accounts/xyz'
 * @param {Object} [options] - { apiKey, payload }
 */
export async function klaviyoRequest(method, endpoint, { apiKey, payload } = {}) {
    const url = endpoint.startsWith("http")
        ? endpoint
        : `${BASE_URL}${endpoint}`
    const headers = getKlaviyoHeaders(apiKey);

    const fetchOptions = {
        method,
        headers,
    };

    if (payload && (method === "POST" || method === "PATCH")) {
        fetchOptions.body = JSON.stringify(payload);
    }

    const res = await fetch(url, fetchOptions);
    if (!res.ok) {
        const error = await res.text();
        throw new Error(`Klaviyo API error: ${res.status} ${error}`);
    }
    return res.json();
}

// Convenience wrappers
export const klaviyoGet = (endpoint, opts) => klaviyoRequest("GET", endpoint, opts);
export const klaviyoPost = (endpoint, payload, opts) => klaviyoRequest("POST", endpoint, { ...opts, payload });
export const klaviyoPatch = (endpoint, payload, opts) => klaviyoRequest("PATCH", endpoint, { ...opts, payload });
export const klaviyoDelete = (endpoint, opts) => klaviyoRequest("DELETE", endpoint, opts);

/**
 * Fetches all paginated results from a Klaviyo endpoint.
 * @param {string} endpoint - e.g. 'campaigns?include=tags'
 * @param {Object} opts - { apiKey, ... }
 * @returns {Promise<Object>} - Combined results with all data and included arrays merged.
 */
export async function klaviyoGetAll(endpoint, opts) {
    let url = endpoint;
    let allData = [];
    let allIncluded = [];
    let firstResponse = null;

    while (url) {
        const res = await klaviyoGet(url, opts);
        if (!firstResponse) firstResponse = res;
        if (Array.isArray(res.data)) allData = allData.concat(res.data);
        if (Array.isArray(res.included)) allIncluded = allIncluded.concat(res.included);
        url = res.links && res.links.next ? res.links.next : null;
    }

    // Return a combined response, using the first response as a base
    return {
        ...firstResponse,
        data: allData,
        included: allIncluded,
        links: firstResponse.links,
    };
}

export async function klaviyoReportPost(endpoint, payload, opts) {
    let url = endpoint;
    let allData = [];
    let allIncluded = [];
    let allResults = [];
    let firstResponse = null;

    while (url) {
        const res = await klaviyoPost(url, payload, opts);
        if (!firstResponse) firstResponse = res;
        if (Array.isArray(res.data)) allData = allData.concat(res.data);
        if (Array.isArray(res.included)) allIncluded = allIncluded.concat(res.included);

        // Concatenate results arrays if present
        if (
            res.data &&
            res.data.attributes &&
            Array.isArray(res.data.attributes.results)
        ) {
            allResults = allResults.concat(res.data.attributes.results);
        }

        url = res.links && res.links.next ? res.links.next : null;
    }

    // Attach the combined results to the returned data
    if (firstResponse && firstResponse.data && firstResponse.data.attributes) {
        firstResponse.data.attributes.results = allResults;
    }

    return {
        ...firstResponse,
        data: firstResponse.data,
        included: allIncluded,
        links: firstResponse.links,
    };
}

/**
 * Rate-limited helper function to get multiple flows.
 * Respects Klaviyo's rate limits: 3/s burst, 60/m steady.
 * @param {Array<string>} flowIds - Array of flow IDs to fetch
 * @param {Object} opts - { apiKey, ... }
 * @param {Object} rateLimitOptions - { maxConcurrent?: number, delayMs?: number }
 * @returns {Promise<Array>} Array of flow data
 */
export async function getFlowsWithRateLimit(flowIds, opts, rateLimitOptions = {}) {
    const { maxConcurrent = 2, delayMs = 1000 } = rateLimitOptions;
    const results = [];
    const errors = [];

    // Process flows in batches to respect rate limits
    for (let i = 0; i < flowIds.length; i += maxConcurrent) {
        const batch = flowIds.slice(i, i + maxConcurrent);
        const batchPromises = batch.map(async (flowId, index) => {
            try {
                // Add small delay between requests in the same batch
                if (index > 0) {
                    await new Promise(resolve => setTimeout(resolve, 350)); // ~3/s rate limit
                }

                const response = await klaviyoGet(`flows/${flowId}`, opts);
                return response;
            } catch (error) {
                console.error(`Error fetching flow ${flowId}:`, error);
                errors.push({ flowId, error: error.message });
                return null;
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(Boolean));

        // Add delay between batches to respect steady rate limit
        if (i + maxConcurrent < flowIds.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    if (errors.length > 0) {
        console.warn(`Failed to fetch ${errors.length} flows:`, errors);
    }

    return results;
}

/**
 * Get a single flow by ID with error handling.
 * @param {string} flowId - Flow ID to fetch
 * @param {Object} opts - { apiKey, ... }
 * @returns {Promise<Object|null>} Flow data or null if error
 */
export async function getFlow(flowId, opts) {
    try {
        const response = await klaviyoGet(`flows/${flowId}`, opts);
        return response;
    } catch (error) {
        console.error(`Error fetching flow ${flowId}:`, error);
        return null;
    }
}