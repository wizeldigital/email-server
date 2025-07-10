import express from 'express';
import FlowStat from '../../../models/FlowStats.js';

const router = express.Router();

// GET /api/v1/flows - Get flow statistics with access control
router.get('/', async (req, res) => {
    try {
        const {
            userId,
            query,
            limit = 50,
            skip = 0,
            sort = JSON.stringify({ created_at: -1 }),
            dateFrom,
            dateTo
        } = req.query;

        if (!userId) {
            return res.status(400).json({
                error: 'userId is required'
            });
        }

        // Parse sort parameter if it's a string
        let sortObj;
        try {
            sortObj = typeof sort === 'string' ? JSON.parse(sort) : sort;
        } catch (e) {
            sortObj = { created_at: -1 };
        }

        // Build date range if provided
        let dateRange = null;
        if (dateFrom && dateTo) {
            dateRange = {
                from: new Date(dateFrom),
                to: new Date(dateTo)
            };
        }

        const options = {
            limit: parseInt(limit),
            skip: parseInt(skip),
            sort: sortObj,
            dateRange
        };

        const { results, total } = await FlowStat.searchWithAccessControl(
            userId,
            query,
            options
        );

        res.json({
            success: true,
            data: results,
            pagination: {
                total,
                limit: parseInt(limit),
                skip: parseInt(skip),
                hasMore: total > parseInt(skip) + parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching flow stats:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// POST /api/v1/flows - Create new flow statistics
router.post('/', async (req, res) => {
    try {
        const flowStat = new FlowStat(req.body);
        const savedStat = await flowStat.save();
        
        res.status(201).json({
            success: true,
            data: savedStat
        });
    } catch (error) {
        console.error('Error creating flow stat:', error);
        res.status(400).json({
            error: 'Failed to create flow statistics',
            message: error.message
        });
    }
});

// POST /api/v1/flows/bulk - Bulk upsert flow statistics
router.post('/bulk', async (req, res) => {
    try {
        const { flowStats } = req.body;
        
        if (!Array.isArray(flowStats) || flowStats.length === 0) {
            return res.status(400).json({
                error: 'flowStats array is required and cannot be empty'
            });
        }

        const result = await FlowStat.bulkUpsertFlowStats(flowStats);
        
        res.json({
            success: true,
            data: {
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
                upsertedCount: result.upsertedCount,
                insertedCount: result.insertedCount
            }
        });
    } catch (error) {
        console.error('Error bulk upserting flow stats:', error);
        res.status(400).json({
            error: 'Failed to bulk upsert flow statistics',
            message: error.message
        });
    }
});

// GET /api/v1/flows/:id - Get specific flow statistics
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                error: 'userId is required'
            });
        }

        // First check if user has access to flow stats
        const { results } = await FlowStat.searchWithAccessControl(userId, '', {
            limit: 1
        });

        const flowStat = await FlowStat.findById(id);
        if (!flowStat) {
            return res.status(404).json({
                error: 'Flow statistics not found'
            });
        }

        // Check if user has access to this specific store
        const hasAccess = results.some(stat => 
            stat.store_public_id === flowStat.store_public_id
        );

        if (!hasAccess) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        res.json({
            success: true,
            data: flowStat
        });
    } catch (error) {
        console.error('Error fetching flow stat:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

export default router;