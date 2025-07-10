import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import reportsRouter from './routes/api/v1/reports.js';
import flowsRouter from './routes/api/v1/flows.js';
import { validatePrivateKey } from './middleware/auth.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8001;

// MongoDB connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/email-server');
        console.log('📦 Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

// Connect to database
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes with private key authentication
app.use('/api/v1/reports', validatePrivateKey, reportsRouter);
app.use('/api/v1/flows', validatePrivateKey, flowsRouter);

// Basic route
app.get('/', (req, res) => {
    res.json({
        message: 'Express server is running on port 8001!',
        timestamp: new Date().toISOString()
    });
});

// Health check route
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📊 Health check available at http://localhost:${PORT}/health`);
    console.log(`📈 Reports API available at http://localhost:${PORT}/api/v1/reports`);
    console.log(`🌊 Flows API available at http://localhost:${PORT}/api/v1/flows`);
    console.log(`🔄 Reports Sync API available at http://localhost:${PORT}/api/v1/reports/sync`);
});

export default app; 