import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Change this to your local IP if testing on a real device/emulator while running Next.js locally
const API_URL = 'https://sarita.click/api';

const client = axios.create({
    baseURL: API_URL,
    timeout: 30000, // Tăng thêm để tránh timeout khi xử lý Sheet lớn
    headers: {
        'Content-Type': 'application/json',
    },
});

export const exportOrderApi = {
    // Lấy danh sách lệnh xuất kho (mặc định là 'New')
    getList: async (params?: { warehouse?: string; status?: string; date?: string }) => {
        const response = await client.get('/export-orders', { params });
        return response.data; // { items: [...] }
    },

    // Lấy chi tiết 1 lệnh xuất kho
    getDetail: async (id: string) => {
        const response = await client.get('/export-orders', { params: { id } });
        return response.data; // { ok: true, item: {...} }
    },

    // Lấy danh sách LOT đã xuất/xóa (để kiểm tra conflict khi đồng bộ)
    getDeletedLots: async () => {
        try {
            const response = await client.get('/lots/deleted', { params: { all: 1 } });
            return response.data; // { ok: true, items: [...] }
        } catch (e) {
            console.error('getDeletedLots error:', e);
            return { ok: false, items: [] };
        }
    },

    // Tìm một vị trí sảnh còn trống
    // Lưu ý: Logic này tương đối đơn giản, tìm trong 20 vị trí sảnh của kho
    getEmptyHallPosition: async (warehouseId: string) => {
        try {
            // Lấy toàn bộ vị trí đang bị chiếm đóng để lọc
            const res = await client.get('/locations/positions');
            const occupied = res.data.items || [];
            const occupiedPos = new Set(occupied.map((it: any) => it.posCode));

            const { formatCode } = await import('../lib/locationCodes');

            for (let i = 1; i <= 20; i++) {
                const code = formatCode({
                    warehouse: parseInt(warehouseId) as any,
                    zone: 'S',
                    row: 1,
                    level: 1,
                    pos: i,
                    capacity: 1
                });
                if (!occupiedPos.has(code)) return code;
            }
            return null;
        } catch (e) {
            console.error('getEmptyHallPosition error:', e);
            return null;
        }
    },

    // Di chuyển LOT đến sảnh
    moveToHall: async (fromPos: string, toPos: string, lotCode: string, movedBy: string) => {
        const response = await client.post('/locations/positions/move', {
            fromPos,
            toPos,
            lotCode,
            movedBy
        });
        return response.data;
    },

    // Log vị trí đã di chuyển cho lệnh xuất
    logMovedPosition: async (exportOrderId: string, moves: Array<{
        originalPosition: string;
        newPosition: string;
        lotCode: string;
        warehouse: string;
        movedBy: string;
    }>) => {
        const response = await client.post('/export-orders/moved-positions', {
            exportOrderId,
            moves
        });
        return response.data;
    },

    // Lấy danh sách các vị trí đã di chuyển (Move History)
    getMovedPositions: async () => {
        try {
            const response = await client.get('/export-orders/moved-positions');
            return response.data; // { ok: true, items: [...] }
        } catch (e) {
            console.error('getMovedPositions error:', e);
            return { ok: false, items: [] };
        }
    }
};

export const lotApi = {
    // Tìm kiếm/Lấy danh sách Lot
    getList: async (params?: { q?: string }) => {
        const response = await client.get('/lots', { params });
        return response.data; // { items: [...] }
    }
};

export default client;
