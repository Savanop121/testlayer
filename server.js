import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import Node from './models/Node.js';
import log from './utils/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());

// Connect to MongoDB
connectDB();

// Rate limiting middleware
const rateLimit = new Map();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

const rateLimiter = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, { count: 1, startTime: now });
        return next();
    }

    const userLimit = rateLimit.get(ip);
    if (now - userLimit.startTime > RATE_WINDOW) {
        rateLimit.set(ip, { count: 1, startTime: now });
        return next();
    }

    if (userLimit.count >= RATE_LIMIT) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    userLimit.count++;
    next();
};

app.use(rateLimiter);

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// API Routes
app.post('/api/auth/connect', async (req, res) => {
    try {
        const { signature, address, timestamp } = req.body;
        const message = `Connecting wallet ${address} at ${timestamp}`;
        const recoveredAddress = ethers.verifyMessage(message, signature);

        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        let node = await Node.findOne({ address: address.toLowerCase() });
        if (!node) {
            node = new Node({ 
                address: address.toLowerCase(),
                referralCode: address.slice(2, 10)
            });
            await node.save();
        }

        const token = jwt.sign({ address: address.toLowerCase() }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, node });

    } catch (error) {
        log.error('Auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

app.post('/api/node/start', verifyToken, async (req, res) => {
    try {
        const node = await Node.findOne({ address: req.user.address });
        if (!node) {
            return res.status(404).json({ error: 'Node not found' });
        }

        if (node.status === 'running') {
            return res.status(400).json({ error: 'Node already running' });
        }

        node.status = 'running';
        node.startTime = new Date();
        await node.save();

        res.json({ 
            message: 'Node started successfully',
            startTime: node.startTime
        });

    } catch (error) {
        log.error('Start node error:', error);
        res.status(500).json({ error: 'Failed to start node' });
    }
});

app.post('/api/node/stop', verifyToken, async (req, res) => {
    try {
        const node = await Node.findOne({ address: req.user.address });
        if (!node || node.status !== 'running') {
            return res.status(404).json({ error: 'No running node found' });
        }

        const runningTime = (Date.now() - node.startTime.getTime()) / 1000;
        const earnedPoints = Math.floor(runningTime / 3600) * 2;

        node.status = 'stopped';
        node.points += earnedPoints;
        node.totalRuntime += runningTime;
        node.startTime = null;
        await node.save();

        res.json({ 
            message: 'Node stopped successfully',
            runningTime,
            earnedPoints,
            totalPoints: node.points
        });

    } catch (error) {
        log.error('Stop node error:', error);
        res.status(500).json({ error: 'Failed to stop node' });
    }
});

app.get('/api/node/status', verifyToken, async (req, res) => {
    try {
        const node = await Node.findOne({ address: req.user.address });
        if (!node) {
            return res.status(404).json({ error: 'Node not found' });
        }

        let runningTime = 0;
        let currentPoints = node.points;

        if (node.status === 'running' && node.startTime) {
            runningTime = (Date.now() - node.startTime.getTime()) / 1000;
            currentPoints += Math.floor(runningTime / 3600) * 2;
        }

        res.json({
            status: node.status,
            startTime: node.startTime,
            runningTime,
            points: currentPoints,
            totalRuntime: node.totalRuntime + runningTime
        });

    } catch (error) {
        log.error('Status check error:', error);
        res.status(500).json({ error: 'Failed to get node status' });
    }
});

app.get('/api/referral/info', verifyToken, async (req, res) => {
    try {
        const node = await Node.findOne({ address: req.user.address })
            .populate('referrals', 'address points status');

        if (!node) {
            return res.status(404).json({ error: 'Node not found' });
        }

        res.json({
            referralCode: node.referralCode,
            referrals: node.referrals,
            totalPoints: node.points
        });

    } catch (error) {
        log.error('Referral info error:', error);
        res.status(500).json({ error: 'Failed to get referral info' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Start server
app.listen(PORT, () => {
    log.info(`LayerEdge API server running on port ${PORT}`);
});

// Cleanup
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        log.info('MongoDB connection closed');
        process.exit(0);
    } catch (error) {
        log.error('Shutdown error:', error);
        process.exit(1);
    }
}); 
