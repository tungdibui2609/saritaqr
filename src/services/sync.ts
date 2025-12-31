import client from '../api/client';
import { database, ScannedLot } from '../database/db';

export const syncService = {
    syncData: async (pendingData: ScannedLot[]) => {
        try {
            // 1. Prepare payload
            const payload = {
                scans: pendingData.map(item => ({
                    code: item.code,
                    quantity: item.quantity,
                    timestamp: item.timestamp,
                    deviceId: 'mobile-app-1' // Optional: Retrieve real ID
                }))
            };

            // 2. Send to API
            const response = await client.post('/scan/sync', payload);

            if (response.data.ok) {
                // 3. Mark as synced in local DB
                pendingData.forEach(item => {
                    database.markAsSynced(item.id);
                });
                return { success: true, count: pendingData.length };
            } else {
                throw new Error(response.data.message || 'Sync failed');
            }
        } catch (error) {
            console.error('Sync Error:', error);
            throw error;
        }
    }
};
