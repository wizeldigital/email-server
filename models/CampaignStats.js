import mongoose from "mongoose";
import User from "./User.js";
import Store from "./Store.js";
import { PERMISSIONS, hasPermission } from "../lib/permissions.js";

const CampaignStatSchema = new mongoose.Schema({
    groupings: {
        send_channel: { type: String, enum: ["email", "sms", "push-notification"], required: true },
        campaign_id: { type: String, required: true },
        campaign_message_id: { type: String, required: true },
    },
    statistics: {
        opens: { type: Number, default: 0 },
        open_rate: { type: Number, default: 0 },
        bounced: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        clicks_unique: { type: Number, default: 0 },
        click_rate: { type: Number, default: 0 },
        delivered: { type: Number, default: 0 },
        bounced_or_failed: { type: Number, default: 0 },
        bounced_or_failed_rate: { type: Number, default: 0 },
        delivery_rate: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        failed_rate: { type: Number, default: 0 },
        recipients: { type: Number, default: 0 },
        opens_unique: { type: Number, default: 0 },
        bounce_rate: { type: Number, default: 0 },
        unsubscribe_rate: { type: Number, default: 0 },
        unsubscribe_uniques: { type: Number, default: 0 },
        unsubscribes: { type: Number, default: 0 },
        spam_complaint_rate: { type: Number, default: 0 },
        spam_complaints: { type: Number, default: 0 },
        click_to_open_rate: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 },
        conversion_uniques: { type: Number, default: 0 },
        conversion_value: { type: Number, default: 0 },
        conversion_rate: { type: Number, default: 0 },
        average_order_value: { type: Number, default: 0 },
        revenue_per_recipient: { type: Number, default: 0 },
    },
    campaign_name: { type: String },
    included_audiences: [{ type: String }],
    excluded_audiences: [{ type: String }],
    included_audiences_names: [{ type: String }],
    excluded_audiences_names: [{ type: String }],
    tagIds: [{ type: String }],
    tagNames: [{ type: String }],
    store_public_id: { type: String, required: true },
    store_id: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    send_time: { type: Date },
    created_at: { type: Date },
    scheduled_at: { type: Date },
    updated_at: { type: Date },
});

// Static method for multi-account search with access control
CampaignStatSchema.statics.searchWithAccessControl = async function (userId, query, options = {}) {
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
            { campaign_name: { $regex: query, $options: "i" } },
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

CampaignStatSchema.index({ store_public_id: 1 });
export default mongoose.models.CampaignStat || mongoose.model("CampaignStat", CampaignStatSchema);