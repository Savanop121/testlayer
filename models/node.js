import mongoose from 'mongoose';

const nodeSchema = new mongoose.Schema({
    address: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    startTime: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['running', 'stopped'],
        default: 'stopped'
    },
    points: {
        type: Number,
        default: 0
    },
    totalRuntime: {
        type: Number,
        default: 0
    },
    lastCheckIn: {
        type: Date,
        default: null
    },
    referralCode: String,
    referrals: [{
        type: String,
        ref: 'Node'
    }]
}, {
    timestamps: true
});

export default mongoose.model('Node', nodeSchema); 
