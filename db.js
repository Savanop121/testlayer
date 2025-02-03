import mongoose from 'mongoose';
import log from './utils/logger.js';

export async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        log.info('Connected to MongoDB');
    } catch (error) {
        log.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

mongoose.connection.on('error', (err) => {
    log.error('MongoDB error:', err);
}); 
