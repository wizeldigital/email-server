import mongoose from "mongoose";

const StoreSchema = new mongoose.Schema({
    name: { type: String, required: true },
    public_id: { type: String, required: true, unique: true },
    domain: { type: String },
    settings: {
        timezone: { type: String, default: 'UTC' },
        currency: { type: String, default: 'USD' }
    },
    klaviyo_integration: {
        apiKey: { type: String },
        conversion_metric_id: { type: String },
        flow_date_times: [{ type: Date }]
    },
    last_dashboard_sync: { type: Date },
    is_updating_dashboard: { type: Boolean, default: false },
    tagNames: [{ type: String }]
}, {
    timestamps: true
});

// Static method to find by ObjectId or public_id and update
StoreSchema.statics.findByIdOrPublicIdAndUpdate = async function(idOrPublicId, update, options = {}) {
    // Try finding by ObjectId first
    if (mongoose.Types.ObjectId.isValid(idOrPublicId)) {
        const result = await this.findByIdAndUpdate(idOrPublicId, update, options);
        if (result) return result;
    }
    
    // If not found or not valid ObjectId, try public_id
    return await this.findOneAndUpdate({ public_id: idOrPublicId }, update, options);
};

export default mongoose.models.Store || mongoose.model("Store", StoreSchema);