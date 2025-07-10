import { klaviyoGet } from './klaviyo-api.js';

/**
 * Fetch flow definition with message details
 * @param {string} flowId - Flow ID to fetch
 * @param {Object} opts - { apiKey, ... }
 * @returns {Promise<Object|null>} Flow definition or null if error
 */
export async function getFlowDefinition(flowId, opts) {
    try {
        const response = await klaviyoGet(`flows/${flowId}?additional-fields[flow]=definition`, opts);
        return response;
    } catch (error) {
        console.error(`Error fetching flow definition ${flowId}:`, error);
        return null;
    }
}

/**
 * Fetch multiple flow definitions with rate limiting
 * Respects Klaviyo's rate limits: 3/s burst (max 10 seconds), 60/m steady
 * @param {Array<string>} flowIds - Array of flow IDs to fetch
 * @param {Object} opts - { apiKey, ... }
 * @param {Object} rateLimitOptions - { maxBurst?: number, burstWindowMs?: number }
 * @returns {Promise<Array>} Array of flow definitions
 */
export async function getFlowDefinitions(flowIds, opts, rateLimitOptions = {}) {
    const { maxBurst = 3, burstWindowMs = 1000 } = rateLimitOptions; // 3 requests per second
    const results = [];
    const errors = [];
    
    console.log(`🔍 Fetching ${flowIds.length} flow definitions with rate limiting (3/s burst, 60/m steady)`);

    // Calculate batches based on burst limits
    const batchSize = maxBurst;
    const batchDelayMs = burstWindowMs; // 1 second between batches
    
    // For steady rate: 60/minute = 1 request per second average
    // But we can burst up to 3/second for max 10 seconds (30 requests)
    // After burst, we need to throttle to 1/second to maintain 60/minute average
    
    let totalRequests = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < flowIds.length; i += batchSize) {
        const batch = flowIds.slice(i, i + batchSize);
        const batchStartTime = Date.now();
        
        // Check if we're exceeding burst capacity (30 requests in 10 seconds)
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const burstLimit = Math.min(30, 3 * Math.max(1, elapsedSeconds)); // Max 30 requests in burst
        
        let effectiveBatchSize = batch.length;
        let shouldThrottle = false;
        
        if (totalRequests + batch.length > burstLimit && elapsedSeconds < 10) {
            // We're hitting burst limits, reduce batch size
            effectiveBatchSize = Math.max(1, Math.floor(burstLimit - totalRequests));
            shouldThrottle = true;
        } else if (elapsedSeconds >= 10) {
            // After 10 seconds, throttle to steady rate (1/second)
            effectiveBatchSize = 1;
            shouldThrottle = true;
        }
        
        const actualBatch = batch.slice(0, effectiveBatchSize);
        
        console.log(`📊 Processing batch ${Math.floor(i/batchSize) + 1}: ${actualBatch.length} flows (total: ${totalRequests}/${flowIds.length})`);
        
        // Process current batch
        const batchPromises = actualBatch.map(async (flowId, index) => {
            try {
                // Small stagger within batch to avoid exact simultaneous requests
                if (index > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100 * index));
                }

                const response = await getFlowDefinition(flowId, opts);
                return response;
            } catch (error) {
                console.error(`Error fetching flow definition ${flowId}:`, error);
                errors.push({ flowId, error: error.message });
                return null;
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(Boolean));
        totalRequests += actualBatch.length;
        
        // If we didn't process the full batch, add remaining items back to queue
        if (effectiveBatchSize < batch.length) {
            const remaining = batch.slice(effectiveBatchSize);
            flowIds.splice(i + effectiveBatchSize, 0, ...remaining);
        }

        // Calculate delay for next batch
        const batchDuration = Date.now() - batchStartTime;
        let delayMs = 0;
        
        if (shouldThrottle || elapsedSeconds >= 10) {
            // Steady rate: ensure we don't exceed 60/minute (1 request per second average)
            delayMs = Math.max(1000, 1000 - batchDuration); // At least 1 second between requests
        } else {
            // Burst rate: 3/second (can go faster during burst)
            delayMs = Math.max(batchDelayMs - batchDuration, 0);
        }

        // Wait before next batch if needed
        if (i + batchSize < flowIds.length && delayMs > 0) {
            console.log(`⏳ Waiting ${delayMs}ms before next batch...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    if (errors.length > 0) {
        console.warn(`Failed to fetch ${errors.length} flow definitions:`, errors);
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`✅ Fetched ${results.length} flow definitions in ${totalTime.toFixed(1)}s (${(results.length/totalTime).toFixed(1)} req/s average)`);

    return results;
}

/**
 * Extract message details from a flow action
 * @param {Object} action - Flow action from definition
 * @returns {Object} Message details
 */
export function extractMessageDetails(action) {
    if (!action || !action.data || !action.data.message) {
        return {};
    }

    const message = action.data.message;
    
    return {
        message_name: message.name || null,
        message_from_email: message.from_email || null,
        message_from_label: message.from_label || null,
        message_subject_line: message.subject_line || null,
        message_preview_text: message.preview_text || null,
        message_template_id: message.template_id || null,
        message_transactional: message.transactional || false,
        message_smart_sending_enabled: message.smart_sending_enabled || false
    };
}

/**
 * Extract experiment details from an AB test action
 * @param {Object} action - AB test action from definition
 * @returns {Object} Experiment details
 */
export function extractExperimentDetails(action) {
    if (!action || action.type !== 'ab-test' || !action.data) {
        return { has_experiment: false };
    }

    const experiment = action.data.current_experiment;
    if (!experiment) {
        return { has_experiment: false };
    }

    const variations = (experiment.variations || []).map(variation => ({
        variation_id: variation.id,
        variation_name: variation.data?.message?.name || null,
        allocation: experiment.allocations?.[variation.id] || 0,
        message_name: variation.data?.message?.name || null,
        message_subject_line: variation.data?.message?.subject_line || null,
        message_template_id: variation.data?.message?.template_id || null
    }));

    return {
        has_experiment: true,
        experiment_id: experiment.id || null,
        experiment_name: experiment.name || null,
        experiment_status: action.data.experiment_status || null,
        experiment_winner_metric: experiment.winner_metric || null,
        experiment_variations: variations
    };
}

/**
 * Find message details for a specific flow_message_id in flow definition
 * @param {Object} flowDefinition - Flow definition response from Klaviyo
 * @param {string} flowMessageId - The specific message ID to find
 * @returns {Object} Combined message and experiment details
 */
export function findMessageInFlowDefinition(flowDefinition, flowMessageId) {
    if (!flowDefinition?.data?.attributes?.definition?.actions) {
        return {};
    }

    const actions = flowDefinition.data.attributes.definition.actions;
    
    // Search through all actions to find the matching message ID
    for (const action of actions) {
        // Check main action message
        if (action.data?.message?.id === flowMessageId) {
            const messageDetails = extractMessageDetails(action);
            const experimentDetails = extractExperimentDetails(action);
            return { ...messageDetails, ...experimentDetails };
        }

        // Check main action in AB test
        if (action.type === 'ab-test' && action.data?.main_action?.data?.message?.id === flowMessageId) {
            const messageDetails = extractMessageDetails(action.data.main_action);
            const experimentDetails = extractExperimentDetails(action);
            return { ...messageDetails, ...experimentDetails };
        }

        // Check experiment variations
        if (action.type === 'ab-test' && action.data?.current_experiment?.variations) {
            for (const variation of action.data.current_experiment.variations) {
                if (variation.data?.message?.id === flowMessageId) {
                    const messageDetails = extractMessageDetails(variation);
                    const experimentDetails = extractExperimentDetails(action);
                    return { ...messageDetails, ...experimentDetails };
                }
            }
        }
    }

    return {};
}

/**
 * Build a lookup map of flow message details from flow definitions
 * @param {Array} flowDefinitions - Array of flow definition responses
 * @returns {Object} Map of flow_message_id -> message details
 */
export function buildMessageDetailsMap(flowDefinitions) {
    const messageMap = {};

    for (const flowDef of flowDefinitions) {
        if (!flowDef?.data?.attributes?.definition?.actions) continue;

        const actions = flowDef.data.attributes.definition.actions;
        
        for (const action of actions) {
            // Process main action messages
            if (action.data?.message?.id) {
                const messageId = action.data.message.id;
                const messageDetails = extractMessageDetails(action);
                const experimentDetails = extractExperimentDetails(action);
                messageMap[messageId] = { ...messageDetails, ...experimentDetails };
            }

            // Process main action in AB test
            if (action.type === 'ab-test' && action.data?.main_action?.data?.message?.id) {
                const messageId = action.data.main_action.data.message.id;
                const messageDetails = extractMessageDetails(action.data.main_action);
                const experimentDetails = extractExperimentDetails(action);
                messageMap[messageId] = { ...messageDetails, ...experimentDetails };
            }

            // Process experiment variations
            if (action.type === 'ab-test' && action.data?.current_experiment?.variations) {
                const experimentDetails = extractExperimentDetails(action);
                
                for (const variation of action.data.current_experiment.variations) {
                    if (variation.data?.message?.id) {
                        const messageId = variation.data.message.id;
                        const messageDetails = extractMessageDetails(variation);
                        messageMap[messageId] = { ...messageDetails, ...experimentDetails };
                    }
                }
            }
        }
    }

    return messageMap;
}