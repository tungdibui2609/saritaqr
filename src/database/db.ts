import * as SQLite from 'expo-sqlite';

// Open the database asynchronously
const db = SQLite.openDatabaseSync('qlk_scanner.db');

export interface ScannedLot {
    id: number;
    code: string;
    quantity: number;
    timestamp: string;
    synced: number; // 0: false, 1: true
}

export const initDatabase = () => {
    try {
        db.execSync(`
      CREATE TABLE IF NOT EXISTS scanned_lots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        quantity REAL NOT NULL,
        timestamp TEXT NOT NULL, 
        synced INTEGER DEFAULT 0
      );
    `);
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
    }
};

export const database = {
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
    }
};
