import mongoose from "mongoose";
import User from "./User.js";
import Store from "./Store.js";
import { PERMISSIONS, hasPermission } from "../lib/permissions.js";

const statisticsSchema = new mongoose.Schema({
    opens: [Number],
    open_rate: [Number],
    bounced: [Number],
    clicks: [Number],
    clicks_unique: [Number],
    click_rate: [Number],
    delivered: [Number],
    bounced_or_failed: [Number],
    bounced_or_failed_rate: [Number],
    delivery_rate: [Number],
    failed: [Number],
    failed_rate: [Number],
    recipients: [Number],
    opens_unique: [Number],
    bounce_rate: [Number],
    unsubscribe_rate: [Number],
    unsubscribe_uniques: [Number],
    unsubscribes: [Number],
    spam_complaint_rate: [Number],
    spam_complaints: [Number],
    click_to_open_rate: [Number],
    conversions: [Number],
    conversion_uniques: [Number],
    conversion_value: [Number],
    conversion_rate: [Number],
    average_order_value: [Number],
    revenue_per_recipient: [Number],
}, { _id: false });

const FlowStatSchema = new mongoose.Schema({
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    store_public_id: { type: String, required: true, index: true },
    flow_id: { type: String, required: true, index: true },
    flow_message_id: { type: String, required: true, index: true }, // Add flow_message_id field
    flow_name: { type: String },
    flow_message_name: { type: String },
    flow_message_subject: { type: String },
    flow_status: { type: String },
    flow_archived: { type: Boolean, default: false },
    flow_created: { type: Date },
    flow_updated: { type: Date },
    flow_trigger_type: { type: String },
    send_channel: { type: String, required: true },
    tagIds: [{ type: String }],
    tagNames: [{ type: String }],
    statistics: statisticsSchema, // Single statistics object with arrays for each metric
    
    // Message details from flow definition
    message_name: { type: String },
    message_from_email: { type: String },
    message_from_label: { type: String },
    message_subject_line: { type: String },
    message_preview_text: { type: String },
    message_template_id: { type: String },
    message_transactional: { type: Boolean },
    message_smart_sending_enabled: { type: Boolean },
    
    // Experiment details
    has_experiment: { type: Boolean, default: false },
    experiment_id: { type: String },
    experiment_name: { type: String },
    experiment_status: { type: String },
    experiment_winner_metric: { type: String },
    experiment_variations: [{
        variation_id: { type: String },
        variation_name: { type: String },
        allocation: { type: Number },
        message_name: { type: String },
        message_subject_line: { type: String },
        message_template_id: { type: String }
    }],
    
    last_updated: { type: Date, default: Date.now },
}, { timestamps: true });

// Compound index for efficient queries (updated to include flow_message_id)
FlowStatSchema.index({ store: 1, flow_id: 1, flow_message_id: 1, send_channel: 1 }, { unique: true });

// Index for date-based queries
FlowStatSchema.index({ date_times: 1 });
FlowStatSchema.index({ store_public_id: 1, flow_id: 1 });

// Static method for multi-account search with access control
FlowStatSchema.statics.searchWithAccessControl = async function (userId, query, options = {}) {
    const {
        limit = 50,
        skip = 0,
        sort = { created_at: -1 },
        dateRange = null,
        requiredPermission = PERMISSIONS.VIEW_ANALYTICS // Default to analytics view permission
    } = options

    // Get user's accessible stores with permission check
    const user = await User.findById(userId)
    if (!user) return { results: [], total: 0 }

    // Filter stores based on granular permissions
    const accessibleStores = user.stores.filter(storeAccess =>
        hasPermission(storeAccess, requiredPermission)
    )

    if (accessibleStores.length === 0) {
        return { results: [], total: 0 }
    }

    const storePublicIds = accessibleStores.map(store => store.store_public_id)

    // Build search query
    const searchQuery = {
        store_public_id: { $in: storePublicIds }
    }

    // Add text search
    if (query && query.trim()) {
        searchQuery.$or = [
            { flow_name: { $regex: query, $options: "i" } },
            { flow_trigger_type: { $regex: query, $options: "i" } },
            { store_public_id: { $regex: query, $options: "i" } }
        ]
    }

    // Add date range filter
    if (dateRange) {
        searchQuery.created_at = {
            $gte: dateRange.from,
            $lte: dateRange.to
        }
    }

    // Execute search with pagination
    const [results, total] = await Promise.all([
        this.find(searchQuery)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments(searchQuery)
    ])

    return { results, total }
}

// Static method to bulk upsert flow stats
FlowStatSchema.statics.bulkUpsertFlowStats = async function (flowStats) {
    const operations = flowStats.map(stat => ({
        updateOne: {
            filter: {
                store: stat.store,
                flow_id: stat.flow_id,
                flow_message_id: stat.flow_message_id,
                send_channel: stat.send_channel
            },
            update: { $set: stat },
            upsert: true
        }
    }));

    const result = await this.bulkWrite(operations);
    return result;
};

export default mongoose.models.FlowStat || mongoose.model("FlowStat", FlowStatSchema);