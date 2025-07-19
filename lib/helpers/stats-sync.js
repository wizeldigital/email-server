import CampaignStat from "../../models/CampaignStats.js";
import FlowStat from "../../models/FlowStats.js";
import Store from "../../models/Store.js";
import { klaviyoGetAll, klaviyoReportPost } from "./klaviyo-api.js";
import { mergeCampaignStatsWithMeta, mergeFlowStatsWithMeta } from "./stats-merger.js";
import { getFlowDefinitions, buildMessageDetailsMap } from "./flow-definitions.js";

export async function klaviyoUpdateStats(store, date = null) {
    // Freshness threshold (temporarily reduced to force sync for debugging)
    const FRESHNESS_THRESHOLD_MS = 1 * 60 * 1000; // 1 minute instead of 15 minutes
    const now = Date.now();
    const lastSync = store.last_dashboard_sync ? new Date(store.last_dashboard_sync).getTime() : 0;

    // If already updating, or data is fresh, do nothing
    if (store.is_updating_dashboard || (now - lastSync < FRESHNESS_THRESHOLD_MS)) {
        console.log('🔄 Sync skipped - data is fresh or already updating');
        return store; // No update needed
    }

    const fromDate = date ? date.toISOString() : new Date(store.last_dashboard_sync).toISOString()

    // Set updating flag
    await Store.findByIdOrPublicIdAndUpdate(store._id, { is_updating_dashboard: true });

    try {
        const [campaigns, smsCampaigns, tags, flows, segments, lists, campaignValuesReports, flowSeriesReports] = await Promise.all([
            klaviyoGetAll(`campaigns?filter=equals(messages.channel,'email'),greater-or-equal(created_at,${fromDate}),equals(status,'Sent')&include=campaign-messages,tags`, { apiKey: store.klaviyo_integration.apiKey }),
            klaviyoGetAll(`campaigns?filter=equals(messages.channel,'sms'),greater-or-equal(created_at,${fromDate}),equals(status,'Sent')&include=tags`, { apiKey: store.klaviyo_integration.apiKey }),
            klaviyoGetAll(`tags`, { apiKey: store.klaviyo_integration.apiKey }),
            klaviyoGetAll(`flows`, { apiKey: store.klaviyo_integration.apiKey }),
            klaviyoGetAll(`segments`, { apiKey: store.klaviyo_integration.apiKey }),
            klaviyoGetAll(`lists`, { apiKey: store.klaviyo_integration.apiKey }),
            klaviyoReportPost("campaign-values-reports", {
                "data": {
                    "type": "campaign-values-report",
                    "attributes": {
                        "statistics": [
                            "average_order_value",
                            "bounce_rate",
                            "bounced",
                            "bounced_or_failed",
                            "bounced_or_failed_rate",
                            "click_rate",
                            "click_to_open_rate",
                            "clicks",
                            "clicks_unique",
                            "conversion_rate",
                            "conversion_uniques",
                            "conversion_value",
                            "conversions",
                            "delivered",
                            "delivery_rate",
                            "failed",
                            "failed_rate",
                            "open_rate",
                            "opens",
                            "opens_unique",
                            "recipients",
                            "revenue_per_recipient",
                            "spam_complaint_rate",
                            "spam_complaints",
                            "unsubscribe_rate",
                            "unsubscribe_uniques",
                            "unsubscribes"
                        ],
                        "timeframe": {
                            "key": "last_12_months"
                        },
                        "conversion_metric_id": store.klaviyo_integration.conversion_metric_id
                    }
                }
            }, { apiKey: store.klaviyo_integration.apiKey }),
            klaviyoReportPost("flow-series-reports", {
                "data": {
                    "type": "flow-series-report",
                    "attributes": {
                        "statistics": [
                            "average_order_value",
                            "bounce_rate",
                            "bounced",
                            "bounced_or_failed",
                            "bounced_or_failed_rate",
                            "click_rate",
                            "click_to_open_rate",
                            "clicks",
                            "clicks_unique",
                            "conversion_rate",
                            "conversion_uniques",
                            "conversion_value",
                            "conversions",
                            "delivered",
                            "delivery_rate",
                            "failed",
                            "failed_rate",
                            "open_rate",
                            "opens",
                            "opens_unique",
                            "recipients",
                            "revenue_per_recipient",
                            "spam_complaint_rate",
                            "spam_complaints",
                            "unsubscribe_rate",
                            "unsubscribe_uniques",
                            "unsubscribes"
                        ],
                        "timeframe": {
                            "start": new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
                            "end": new Date().toISOString()
                        },
                        "interval": "daily",
                        "conversion_metric_id": store.klaviyo_integration.conversion_metric_id
                    }
                }
            }, { apiKey: store.klaviyo_integration.apiKey })
        ])

        const merged = mergeCampaignStatsWithMeta(
            campaignValuesReports.data.attributes.results,
            campaigns.data,
            smsCampaigns.data,
            segments.data,
            lists.data,
            tags.data
        );

        // Get unique flow IDs from the results to fetch their definitions
        const uniqueFlowIds = [...new Set(flowSeriesReports.data.attributes.results.map(result => result.groupings.flow_id))];

        console.log(`🔍 Fetching definitions for ${uniqueFlowIds.length} flows`);

        // Fetch flow definitions with message details
        const flowDefinitions = await getFlowDefinitions(uniqueFlowIds, { apiKey: store.klaviyo_integration.apiKey });

        // Build message details map from flow definitions
        const messageDetailsMap = buildMessageDetailsMap(flowDefinitions);

        console.log(`📋 Found message details for ${Object.keys(messageDetailsMap).length} flow messages`);

        const mergedFlows = mergeFlowStatsWithMeta(
            flowSeriesReports.data.attributes.results,
            flows.data,
            tags.data,
            messageDetailsMap
        );

        const tagNames = tags.data.map(tag => tag.attributes?.name).filter(Boolean);

        // Convert date_times strings to Date objects for storage
        const flowDateTimes = flowSeriesReports.data.attributes.date_times?.map(dateStr => new Date(dateStr)) || [];

        // Update store with Klaviyo integration
        const updatedStore = await Store.findByIdOrPublicIdAndUpdate(
            store._id,
            {
                last_dashboard_sync: new Date(),
                tagNames: tagNames,
                is_updating_dashboard: false,
                "klaviyo_integration.flow_date_times": flowDateTimes,
            },
            { new: true }
        );

        await upsertCampaignStats(merged, store._id, store.public_id);
        await upsertFlowStats(mergedFlows, store._id, store.public_id);

        return updatedStore;
    } catch (error) {
        // On error, clear updating flag
        await Store.findByIdOrPublicIdAndUpdate(store._id, { is_updating_dashboard: false });
        throw error;
    }
}

async function upsertCampaignStats(merged, storeId, storePublicId) {
    for (const stat of merged) {
        await CampaignStat.updateOne(
            {
                store_id: storeId,
                "groupings.campaign_id": stat.groupings.campaign_id,
            },
            {
                $set: {
                    ...stat,
                    store_id: storeId, // ensure ObjectId type if needed
                    store_public_id: storePublicId
                },
            },
            { upsert: true }
        );
    }

    console.log(`✅ Completed upserting campaign stats for store ${storePublicId}`);
}

async function upsertFlowStats(merged, storeId, storePublicId) {
    console.log(`🔄 Upserting ${merged.length} flow stats for store ${storePublicId}`);

    for (const stat of merged) {
        console.log(`📊 Flow: ${stat.flow_id} - Message: ${stat.flow_message_id} (${stat.send_channel})`);

        await FlowStat.updateOne(
            {
                store: storeId,
                flow_id: stat.flow_id,
                flow_message_id: stat.flow_message_id, // Add flow_message_id to the filter
                send_channel: stat.send_channel,
            },
            {
                $set: {
                    ...stat,
                    store: storeId,
                    store_public_id: storePublicId,
                    last_updated: new Date()
                },
            },
            { upsert: true }
        );
    }

    console.log(`✅ Completed upserting flow stats for store ${storePublicId}`);
}