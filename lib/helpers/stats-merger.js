/**
 * Merge campaign stats with campaign metadata for both email and sms.
 * @param {Array} results - campaignValuesReports.data.attributes.results
 * @param {Array} campaigns - email campaigns (from campaigns.data)
 * @param {Array} smsCampaigns - sms campaigns (from smsCampaigns.data)
 * @param {Array} segments - segments data (from segments.data)
 * @param {Array} lists - lists data (from lists.data)
 * @param {Array} tags - tags data (from tags.data)
 * @returns {Array} merged array
 */
export function mergeCampaignStatsWithMeta(results, campaigns, smsCampaigns, segments = [], lists = [], tags = []) {
    // Debug: Log the first result to see the data structure
    if (results.length > 0) {
        console.log('🔍 Debug campaign stats structure:', {
            firstResult: results[0],
            statisticsKeys: Object.keys(results[0].statistics || {}),
            hasUnsubscribes: 'unsubscribes' in (results[0].statistics || {}),
            hasSpamComplaints: 'spam_complaints' in (results[0].statistics || {}),
            totalResults: results.length
        });
    }

    // Build lookup maps for both email and sms campaigns
    const campaignMap = {};
    for (const c of campaigns) campaignMap[c.id] = c;
    for (const c of smsCampaigns) campaignMap[c.id] = c;

    // Build tag name lookup
    const tagNameMap = {};
    for (const tag of tags) {
        tagNameMap[tag.id] = tag.attributes?.name || null;
    }

    // Build audience name lookup from segments and lists
    const audienceNameMap = {};
    for (const seg of segments) {
        audienceNameMap[seg.id] = seg.attributes?.name || null;
    }
    for (const list of lists) {
        audienceNameMap[list.id] = list.attributes?.name || null;
    }

    // Merge stats with campaign meta
    return results
        .filter(r => r.groupings.send_channel === "email" || r.groupings.send_channel === "sms")
        .map(r => {
            const campaign = campaignMap[r.groupings.campaign_id];
            const tagIds = campaign?.relationships?.tags?.data?.map(tag => tag.id) || [];
            const includedAudienceIds = campaign?.attributes?.audiences?.included || [];
            const excludedAudienceIds = campaign?.attributes?.audiences?.excluded || [];

            // Ensure all required statistics fields are present with defaults
            const statistics = {
                opens: 0,
                open_rate: 0,
                bounced: 0,
                clicks: 0,
                clicks_unique: 0,
                click_rate: 0,
                delivered: 0,
                bounced_or_failed: 0,
                bounced_or_failed_rate: 0,
                delivery_rate: 0,
                failed: 0,
                failed_rate: 0,
                recipients: 0,
                opens_unique: 0,
                bounce_rate: 0,
                unsubscribe_rate: 0,
                unsubscribe_uniques: 0,
                unsubscribes: 0,
                spam_complaint_rate: 0,
                spam_complaints: 0,
                click_to_open_rate: 0,
                conversions: 0,
                conversion_uniques: 0,
                conversion_value: 0,
                conversion_rate: 0,
                average_order_value: 0,
                revenue_per_recipient: 0,
                ...r.statistics // Override with actual values from API
            };

            return {
                ...r, // all original data
                statistics, // Use our normalized statistics object
                campaign_name: campaign?.attributes?.name || null,
                included_audiences: includedAudienceIds,
                excluded_audiences: excludedAudienceIds,
                included_audiences_names: includedAudienceIds.map(id => audienceNameMap[id]).filter(Boolean),
                excluded_audiences_names: excludedAudienceIds.map(id => audienceNameMap[id]).filter(Boolean),
                tagIds,
                tagNames: tagIds.map(id => tagNameMap[id]).filter(Boolean),
                send_time: campaign?.attributes?.send_time || null,
                created_at: campaign?.attributes?.created_at || null,
                scheduled_at: campaign?.attributes?.scheduled_at || null,
                updated_at: campaign?.attributes?.updated_at || null,
            };
        });
}

/**
 * Merge flow statistics with flow metadata and message details.
 * @param {Array} results - flowSeriesReports.data.attributes.results
 * @param {Array} flows - flows data (from flows.data)
 * @param {Array} tags - tags data (from tags.data)
 * @param {Object} messageDetailsMap - Map of flow_message_id -> message details from flow definitions
 * @returns {Array} merged array with flow metadata (each result as separate record)
 */
export function mergeFlowStatsWithMeta(results, flows, tags = [], messageDetailsMap = {}) {
    // Build lookup map for flows
    const flowMap = {};
    for (const flow of flows) {
        flowMap[flow.id] = flow;
    }

    // Build tag name lookup
    const tagNameMap = {};
    for (const tag of tags) {
        tagNameMap[tag.id] = tag.attributes?.name || null;
    }

    // Process each result individually (no merging by flow_id)
    return results.map(stat => {
        const flow = flowMap[stat.groupings.flow_id];
        const tagIds = flow?.relationships?.tags?.data?.map(tag => tag.id) || [];
        
        // Get message details from the definitions map
        const messageDetails = messageDetailsMap[stat.groupings.flow_message_id] || {};

        return {
            flow_id: stat.groupings.flow_id,
            flow_message_id: stat.groupings.flow_message_id, // Include the specific message ID
            send_channel: stat.groupings.send_channel,
            flow_name: flow?.attributes?.name || null,
            flow_status: flow?.attributes?.status || null,
            flow_archived: flow?.attributes?.archived || false,
            flow_created: flow?.attributes?.created || null,
            flow_updated: flow?.attributes?.updated || null,
            flow_trigger_type: flow?.attributes?.trigger_type || null,
            tagIds,
            tagNames: tagIds.map(id => tagNameMap[id]).filter(Boolean),
            statistics: stat.statistics, // Direct statistics object (no merging)
            
            // Message details from flow definitions
            ...messageDetails
        };
    });
}