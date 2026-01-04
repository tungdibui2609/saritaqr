import * as SQLite from 'expo-sqlite';

// Open the database asynchronously
const db = SQLite.openDatabaseSync('qlk_scanner.db');

export interface ScannedLot {
    id: number;
    code: string;
    quantity: number;
    timestamp: string;
    synced: number; // 0: false, 1: true
    position?: string;
}

export interface UserOperation {
    id: number;
    type: 'HA_SANH' | 'GAN_VI_TRI' | 'XUAT_KHO';
    lot_code: string;
    product_name?: string; // Optional product name/details
    quantity: number;
    position_from?: string;
    position_to?: string;
    reason?: string;
    timestamp: string;
    details?: string; // JSON string for extra data
}

export const initDatabase = () => {
    try {
        db.execSync(`
      CREATE TABLE IF NOT EXISTS scanned_lots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        quantity REAL NOT NULL,
        timestamp TEXT NOT NULL, 
        synced INTEGER DEFAULT 0,
        position TEXT
      );

      CREATE TABLE IF NOT EXISTS user_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        lot_code TEXT NOT NULL,
        product_name TEXT,
        quantity REAL NOT NULL,
        position_from TEXT,
        position_to TEXT,
        reason TEXT,
        timestamp TEXT NOT NULL,
        details TEXT
      );
    `);
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
    }
};

export const database = {
    // ... existing ScannedLot methods ...
    addScan: (code: string, quantity: number) => {
        try {
            const timestamp = new Date().toISOString();
            const result = db.runSync(
                'INSERT INTO scanned_lots (code, quantity, timestamp, synced) VALUES (?, ?, ?, 0)',
                code,
                quantity,
                timestamp
            );
            return result.lastInsertRowId;
        } catch (error) {
            console.error('Error adding scan:', error);
            throw error;
        }
    },

    getPendingScans: (): ScannedLot[] => {
        try {
            return db.getAllSync('SELECT * FROM scanned_lots WHERE synced = 0');
        } catch (error) {
            console.error('Error getting pending scans:', error);
            return [];
        }
    },

    getAllScans: (): ScannedLot[] => {
        try {
            return db.getAllSync('SELECT * FROM scanned_lots ORDER BY timestamp DESC');
        } catch (error) {
            console.error('Error getting all scans:', error);
            return [];
        }
    },

    getScansByRange: (startDate: string, endDate: string): ScannedLot[] => {
        try {
            return db.getAllSync(
                'SELECT * FROM scanned_lots WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC',
                [startDate, endDate]
            );
        } catch (error) {
            console.error('Error getting scans by range:', error);
            return [];
        }
    },

    markAsSynced: (id: number) => {
        try {
            db.runSync('UPDATE scanned_lots SET synced = 1 WHERE id = ?', id);
        } catch (error) {
            console.error('Error marking as synced:', error);
        }
    },

    deleteScan: (id: number) => {
        try {
            db.runSync('DELETE FROM scanned_lots WHERE id = ?', id);
        } catch (error) {
            console.error('Error deleting scan:', error);
        }
    },

    clearAll: () => {
        try {
            db.runSync('DELETE FROM scanned_lots');
        } catch (error) {
            console.error('Error clearing database:', error);
        }
    },

    // --- NEW OPERATIONS LOG ---

    logOperation: (
        type: 'HA_SANH' | 'GAN_VI_TRI' | 'XUAT_KHO',
        lot_code: string,
        quantity: number,
        details: Partial<UserOperation> = {} // Optional fields
    ) => {
        const execute = () => {
            const timestamp = new Date().toISOString();
            db.runSync(
                `INSERT INTO user_operations (type, lot_code, product_name, quantity, position_from, position_to, reason, timestamp, details) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                type,
                lot_code,
                details.product_name || null,
                quantity,
                details.position_from || null,
                details.position_to || null,
                details.reason || null,
                timestamp,
                details.details ? JSON.stringify(details.details) : null
            );
        };

        try {
            execute();
        } catch (error: any) {
            if (error?.message?.includes('no such table')) {
                console.log('Auto-fixing DB: Creating missing tables...');
                initDatabase();
                try { execute(); } catch (retryError) { console.error('Retry failed:', retryError); }
            } else {
                console.error('Error logging operation:', error);
            }
        }
    },

    getOperations: (
        startDate: string,
        endDate: string,
        type?: 'HA_SANH' | 'GAN_VI_TRI' | 'XUAT_KHO'
    ): UserOperation[] => {
        const execute = () => {
            let query = 'SELECT * FROM user_operations WHERE timestamp >= ? AND timestamp <= ?';
            const params = [startDate, endDate];

            if (type) {
                query += ' AND type = ?';
                params.push(type);
            }

            query += ' ORDER BY timestamp DESC';
            return db.getAllSync(query, params) as UserOperation[];
        };

        try {
            return execute();
        } catch (error: any) {
            if (error?.message?.includes('no such table')) {
                console.log('Auto-fixing DB: Creating missing tables...');
                initDatabase();
                try { return execute(); } catch (e) { return []; }
            }
            console.error('Error getting operations:', error);
            return [];
        }
    },

    // Helper to get distinct dates (for sections) if needed, but handled in UI
};
