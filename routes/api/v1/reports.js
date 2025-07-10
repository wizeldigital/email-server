import express from 'express';
import CampaignStat from '../../../models/CampaignStats.js';
import Store from '../../../models/Store.js';
import { klaviyoUpdateStats } from '../../../lib/helpers/stats-sync.js';

const router = express.Router();

// GET /api/v1/reports - Get campaign statistics with access control
router.get('/', async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    
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

        console.log(`📊 [${requestId}] GET /reports - User: ${userId}, Query: "${query}", Limit: ${limit}, Skip: ${skip}`);

        if (!userId) {
            console.warn(`❌ [${requestId}] Missing userId parameter`);
            return res.status(400).json({
                error: 'userId is required'
            });
        }

        // Parse sort parameter if it's a string
        let sortObj;
        try {
            sortObj = typeof sort === 'string' ? JSON.parse(sort) : sort;
            console.log(`🔍 [${requestId}] Sort criteria:`, sortObj);
        } catch (e) {
            console.warn(`⚠️ [${requestId}] Invalid sort parameter, using default`);
            sortObj = { created_at: -1 };
        }

        // Build date range if provided
        let dateRange = null;
        if (dateFrom && dateTo) {
            dateRange = {
                from: new Date(dateFrom),
                to: new Date(dateTo)
            };
            console.log(`📅 [${requestId}] Date range: ${dateFrom} to ${dateTo}`);
        }

        const options = {
            limit: parseInt(limit),
            skip: parseInt(skip),
            sort: sortObj,
            dateRange
        };

        console.log(`🔎 [${requestId}] Searching campaign stats with access control...`);
        const searchStartTime = Date.now();

        const { results, total } = await CampaignStat.searchWithAccessControl(
            userId,
            query,
            options
        );

        const searchDuration = Date.now() - searchStartTime;
        console.log(`✅ [${requestId}] Found ${results.length} results (${total} total) in ${searchDuration}ms`);

        const response = {
            success: true,
            data: results,
            pagination: {
                total,
                limit: parseInt(limit),
                skip: parseInt(skip),
                hasMore: total > parseInt(skip) + parseInt(limit)
            }
        };

        const totalDuration = Date.now() - startTime;
        console.log(`🏁 [${requestId}] GET /reports completed in ${totalDuration}ms`);

        res.json(response);

    } catch (error) {
        const totalDuration = Date.now() - startTime;
        console.error(`❌ [${requestId}] GET /reports error after ${totalDuration}ms:`, error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// POST /api/v1/reports - Create new campaign statistics
router.post('/', async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    
    try {
        console.log(`📝 [${requestId}] POST /reports - Creating campaign statistics`);
        console.log(`📋 [${requestId}] Request body keys:`, Object.keys(req.body));

        const campaignStat = new CampaignStat(req.body);
        
        console.log(`💾 [${requestId}] Saving campaign stat for store: ${req.body.store_public_id}`);
        const savedStat = await campaignStat.save();
        
        const totalDuration = Date.now() - startTime;
        console.log(`✅ [${requestId}] Campaign stat created successfully in ${totalDuration}ms`);
        
        res.status(201).json({
            success: true,
            data: savedStat
        });
    } catch (error) {
        const totalDuration = Date.now() - startTime;
        console.error(`❌ [${requestId}] POST /reports error after ${totalDuration}ms:`, error);
        res.status(400).json({
            error: 'Failed to create campaign statistics',
            message: error.message
        });
    }
});

// GET /api/v1/reports/:id - Get specific campaign statistics
router.get('/:id', async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    
    try {
        const { id } = req.params;
        const { userId } = req.query;

        console.log(`🔍 [${requestId}] GET /reports/${id} - User: ${userId}`);

        if (!userId) {
            console.warn(`❌ [${requestId}] Missing userId parameter`);
            return res.status(400).json({
                error: 'userId is required'
            });
        }

        // First check if user has access to reports
        console.log(`🔐 [${requestId}] Checking user access permissions...`);
        const { results } = await CampaignStat.searchWithAccessControl(userId, '', {
            limit: 1
        });

        console.log(`📄 [${requestId}] Finding campaign stat by ID...`);
        const campaignStat = await CampaignStat.findById(id);
        if (!campaignStat) {
            console.warn(`❌ [${requestId}] Campaign statistics not found for ID: ${id}`);
            return res.status(404).json({
                error: 'Campaign statistics not found'
            });
        }

        // Check if user has access to this specific store
        const hasAccess = results.some(stat => 
            stat.store_public_id === campaignStat.store_public_id
        );

        if (!hasAccess) {
            console.warn(`🚫 [${requestId}] Access denied for store: ${campaignStat.store_public_id}`);
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        const totalDuration = Date.now() - startTime;
        console.log(`✅ [${requestId}] Campaign stat retrieved successfully in ${totalDuration}ms`);

        res.json({
            success: true,
            data: campaignStat
        });
    } catch (error) {
        const totalDuration = Date.now() - startTime;
        console.error(`❌ [${requestId}] GET /reports/${req.params.id} error after ${totalDuration}ms:`, error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// POST /api/v1/reports/sync - Trigger Klaviyo stats sync for a store
router.post('/sync', async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    
    try {
        const { storeId, storePublicId, date } = req.body;

        console.log(`🔄 [${requestId}] POST /reports/sync - Store: ${storeId || storePublicId}, Date: ${date || 'latest'}`);
        console.log(`📋 [${requestId}] Private key validated via middleware`);

        if (!storeId && !storePublicId) {
            console.warn(`❌ [${requestId}] Missing store identifier`);
            return res.status(400).json({
                error: 'Either storeId or storePublicId is required'
            });
        }

        // Find the store by ID or public ID
        console.log(`🔍 [${requestId}] Looking up store...`);
        let store;
        if (storeId) {
            console.log(`📄 [${requestId}] Searching by storeId: ${storeId}`);
            store = await Store.findById(storeId);
        } else {
            console.log(`📄 [${requestId}] Searching by public_id: ${storePublicId}`);
            store = await Store.findOne({ public_id: storePublicId });
        }

        if (!store) {
            console.warn(`❌ [${requestId}] Store not found: ${storeId || storePublicId}`);
            return res.status(404).json({
                error: 'Store not found'
            });
        }

        console.log(`✅ [${requestId}] Store found: ${store.public_id} (${store.name})`);

        // Check if store has Klaviyo integration
        if (!store.klaviyo_integration?.apiKey) {
            console.warn(`❌ [${requestId}] Store ${store.public_id} missing Klaviyo integration`);
            return res.status(400).json({
                error: 'Store does not have Klaviyo integration configured',
                message: 'Please configure klaviyo_integration.apiKey for this store'
            });
        }

        console.log(`🔑 [${requestId}] Klaviyo integration verified for store: ${store.public_id}`);

        // Parse date if provided
        let syncDate = null;
        if (date) {
            syncDate = new Date(date);
            if (isNaN(syncDate.getTime())) {
                console.warn(`❌ [${requestId}] Invalid date format: ${date}`);
                return res.status(400).json({
                    error: 'Invalid date format',
                    message: 'Please provide date in ISO format (e.g., 2024-01-01T00:00:00Z)'
                });
            }
            console.log(`📅 [${requestId}] Using sync date: ${syncDate.toISOString()}`);
        } else {
            console.log(`📅 [${requestId}] Using last sync date: ${store.last_dashboard_sync || 'never'}`);
        }

        console.log(`🚀 [${requestId}] Starting Klaviyo sync for store: ${store.public_id}`);
        const syncStartTime = Date.now();

        // Trigger the sync
        const updatedStore = await klaviyoUpdateStats(store, syncDate);
        
        const syncDuration = Date.now() - syncStartTime;
        console.log(`✅ [${requestId}] Klaviyo sync completed in ${syncDuration}ms for store: ${store.public_id}`);

        const response = {
            success: true,
            message: 'Klaviyo stats sync completed successfully',
            data: {
                store_id: updatedStore._id,
                store_public_id: updatedStore.public_id,
                last_sync: updatedStore.last_dashboard_sync,
                tag_count: updatedStore.tagNames?.length || 0,
                flow_date_times_count: updatedStore.klaviyo_integration?.flow_date_times?.length || 0
            }
        };

        const totalDuration = Date.now() - startTime;
        console.log(`🏁 [${requestId}] POST /reports/sync completed in ${totalDuration}ms`);
        console.log(`📊 [${requestId}] Sync results: ${response.data.tag_count} tags, ${response.data.flow_date_times_count} flow timestamps`);

        res.json(response);

    } catch (error) {
        const totalDuration = Date.now() - startTime;
        console.error(`❌ [${requestId}] POST /reports/sync error after ${totalDuration}ms:`, error);
        res.status(500).json({
            error: 'Klaviyo sync failed',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// GET /api/v1/reports/sync/status/:storeId - Check sync status for a store
router.get('/sync/status/:storeId', async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    
    try {
        const { storeId } = req.params;

        console.log(`📋 [${requestId}] GET /reports/sync/status/${storeId} - Checking sync status`);

        console.log(`🔍 [${requestId}] Looking up store by ID or public_id...`);
        const store = await Store.findById(storeId) || await Store.findOne({ public_id: storeId });

        if (!store) {
            console.warn(`❌ [${requestId}] Store not found: ${storeId}`);
            return res.status(404).json({
                error: 'Store not found'
            });
        }

        console.log(`✅ [${requestId}] Store found: ${store.public_id} (${store.name})`);
        console.log(`📊 [${requestId}] Sync status: updating=${store.is_updating_dashboard}, last_sync=${store.last_dashboard_sync}`);

        const response = {
            success: true,
            data: {
                store_id: store._id,
                store_public_id: store.public_id,
                is_updating: store.is_updating_dashboard || false,
                last_sync: store.last_dashboard_sync,
                has_klaviyo_integration: !!store.klaviyo_integration?.apiKey,
                tag_count: store.tagNames?.length || 0,
                flow_date_times_count: store.klaviyo_integration?.flow_date_times?.length || 0
            }
        };

        const totalDuration = Date.now() - startTime;
        console.log(`🏁 [${requestId}] Sync status retrieved in ${totalDuration}ms`);

        res.json(response);

    } catch (error) {
        const totalDuration = Date.now() - startTime;
        console.error(`❌ [${requestId}] GET /reports/sync/status error after ${totalDuration}ms:`, error);
        res.status(500).json({
            error: 'Failed to check sync status',
            message: error.message
        });
    }
});

// POST /api/v1/reports/sync/bulk - Trigger sync for multiple stores
router.post('/sync/bulk', async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    
    try {
        const { storeIds, storePublicIds, date } = req.body;

        console.log(`🔄 [${requestId}] POST /reports/sync/bulk - IDs: ${(storeIds || storePublicIds || []).length} stores, Date: ${date || 'latest'}`);
        console.log(`📋 [${requestId}] Store identifiers:`, storeIds || storePublicIds);

        if (!storeIds && !storePublicIds) {
            console.warn(`❌ [${requestId}] Missing store identifiers`);
            return res.status(400).json({
                error: 'Either storeIds or storePublicIds array is required'
            });
        }

        // Parse date if provided
        let syncDate = null;
        if (date) {
            syncDate = new Date(date);
            if (isNaN(syncDate.getTime())) {
                console.warn(`❌ [${requestId}] Invalid date format: ${date}`);
                return res.status(400).json({
                    error: 'Invalid date format'
                });
            }
            console.log(`📅 [${requestId}] Using sync date: ${syncDate.toISOString()}`);
        }

        // Find stores
        console.log(`🔍 [${requestId}] Looking up stores...`);
        let stores = [];
        if (storeIds) {
            console.log(`📄 [${requestId}] Searching by storeIds: ${storeIds.length} stores`);
            stores = await Store.find({ _id: { $in: storeIds } });
        } else {
            console.log(`📄 [${requestId}] Searching by public_ids: ${storePublicIds.length} stores`);
            stores = await Store.find({ public_id: { $in: storePublicIds } });
        }

        if (stores.length === 0) {
            console.warn(`❌ [${requestId}] No stores found`);
            return res.status(404).json({
                error: 'No stores found'
            });
        }

        console.log(`✅ [${requestId}] Found ${stores.length} stores for bulk sync`);

        // Process stores concurrently since each has separate API limits
        console.log(`🚀 [${requestId}] Starting concurrent sync for ${stores.length} stores...`);
        const bulkSyncStartTime = Date.now();
        
        const storePromises = stores.map(async (store) => {
            const storeStartTime = Date.now();
            try {
                if (!store.klaviyo_integration?.apiKey) {
                    console.warn(`⚠️ [${requestId}] Store ${store.public_id} missing Klaviyo integration`);
                    return {
                        store_id: store._id,
                        store_public_id: store.public_id,
                        success: false,
                        error: 'No Klaviyo integration configured'
                    };
                }

                console.log(`🔄 [${requestId}] Syncing store: ${store.public_id}`);
                const updatedStore = await klaviyoUpdateStats(store, syncDate);
                
                const storeDuration = Date.now() - storeStartTime;
                console.log(`✅ [${requestId}] Store ${store.public_id} synced in ${storeDuration}ms`);
                
                return {
                    store_id: updatedStore._id,
                    store_public_id: updatedStore.public_id,
                    success: true,
                    last_sync: updatedStore.last_dashboard_sync
                };

            } catch (error) {
                const storeDuration = Date.now() - storeStartTime;
                console.error(`❌ [${requestId}] Store ${store.public_id} failed after ${storeDuration}ms:`, error);
                return {
                    store_id: store._id,
                    store_public_id: store.public_id,
                    success: false,
                    error: error.message
                };
            }
        });

        const allResults = await Promise.all(storePromises);
        
        const bulkSyncDuration = Date.now() - bulkSyncStartTime;
        console.log(`🏁 [${requestId}] Bulk sync completed in ${bulkSyncDuration}ms`);
        
        // Separate successful results from errors
        const results = allResults.filter(result => result.success);
        const errors = allResults.filter(result => !result.success);

        console.log(`📊 [${requestId}] Bulk sync results: ${results.length} successful, ${errors.length} failed`);

        const response = {
            success: true,
            message: `Processed ${stores.length} stores`,
            data: {
                successful_syncs: results.length,
                failed_syncs: errors.length,
                results,
                errors
            }
        };

        const totalDuration = Date.now() - startTime;
        console.log(`🏁 [${requestId}] POST /reports/sync/bulk completed in ${totalDuration}ms`);

        res.json(response);

    } catch (error) {
        const totalDuration = Date.now() - startTime;
        console.error(`❌ [${requestId}] POST /reports/sync/bulk error after ${totalDuration}ms:`, error);
        res.status(500).json({
            error: 'Bulk sync failed',
            message: error.message
        });
    }
});

export default router;