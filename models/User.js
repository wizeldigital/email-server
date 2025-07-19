import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    stores: [{
        store_public_id: { type: String, required: true },
        store_id: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
        permissions: [{ type: String }],
        _id: false
    }]
}, {
    timestamps: true
});

export default mongoose.models.User || mongoose.model("User", UserSchema);