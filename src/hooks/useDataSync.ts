import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import client, { exportOrderApi, warehouseApi } from '../api/client';

export const useDataSync = () => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    // Initial load of last updated time
    useEffect(() => {
        AsyncStorage.getItem('offline_data_last_updated').then(val => {
            if (val) {
                setLastUpdated(new Date(parseInt(val)).toLocaleString('vi-VN'));
            }
        });
    }, []);

    const syncAllData = useCallback(async () => {
        setIsDownloading(true);
        try {
            // 1. Fetch Basic Scanner Data
            const p1 = client.get('/scanner/locations').then(res => {
                if (res.data.ok) AsyncStorage.setItem('offline_static_locations', JSON.stringify(res.data.locations));
                return res.data.locations?.length || 0;
            });

            const p2 = client.get('/scanner/occupied').then(res => {
                if (res.data.ok) AsyncStorage.setItem('offline_occupied_locations', JSON.stringify(res.data.occupied));
                return Object.keys(res.data.occupied || {}).length;
            });

            // 2. Fetch Work Orders (from WorkScreen logic)
            const p3 = Promise.all([
                exportOrderApi.getList({ status: 'New' }),
                exportOrderApi.getDeletedLots(),
                client.get('/locations/positions')
            ]).then(async ([ordersData, deletedData, positionsData]) => {
                const fetchedOrders = ordersData.items || [];
                const allPositions = positionsData.data.items || [];

                // Normalization helper
                const norm = (s: string) => (s || "").toString().trim().toUpperCase();

                // Process Realtime Status (Deleted / Moved)
                const deletedSet = new Set<string>();
                (deletedData.items || []).forEach((it: any) => {
                    if (it.lotCode) deletedSet.add(norm(it.lotCode));
                });

                const positionMap: Record<string, string> = {};
                allPositions.forEach((p: any) => {
                    if (p.lotCode) positionMap[norm(p.lotCode)] = p.posCode;
                });

                const processedOrders = fetchedOrders.map((order: any) => {
                    const realtimeStatus = new Array(order.lotCodes.length).fill(null);
                    order.lotCodes.forEach((lotRaw: string, idx: number) => {
                        const lot = norm(lotRaw);
                        if (deletedSet.has(lot)) {
                            realtimeStatus[idx] = "ĐÃ XUẤT";
                        } else if (positionMap[lot]) {
                            const currentPos = positionMap[lot];
                            if (currentPos && currentPos.startsWith('S-')) {
                                realtimeStatus[idx] = currentPos;
                            }
                        }
                    });
                    return { ...order, realtimeStatus };
                });

                // Key matches WorkScreen's key
                await AsyncStorage.setItem('work_offline_orders', JSON.stringify(processedOrders));
                return processedOrders.length;
            });

            // 3. Fetch Warehouse Status (for all 3 warehouses)
            const p4 = [1, 2, 3].map(id =>
                warehouseApi.getStatus(id).then(data =>
                    AsyncStorage.setItem(`offline_warehouse_status_${id}`, JSON.stringify(data))
                )
            );

            // Execute All
            const [locCount, occCount, ordersCount] = await Promise.all([p1, p2, p3, ...p4]);

            const now = Date.now().toString();
            await AsyncStorage.setItem('offline_data_last_updated', now);
            const nowFormatted = new Date(parseInt(now)).toLocaleString('vi-VN');
            setLastUpdated(nowFormatted);

            Alert.alert(
                "Đồng bộ tất cả thành công",
                `• Vị trí: ${locCount}\n• Đang chứa: ${occCount}\n• Lệnh xuất: ${ordersCount}\n• Kho 1, 2, 3: Đã tải xong.`
            );
        } catch (error: any) {
            Alert.alert("Lỗi", "Không thể tải dữ liệu. Vui lòng kiểm tra kết nối mạng.");
            console.error(error);
        } finally {
            setIsDownloading(false);
        }
    }, []);

    return { isDownloading, lastUpdated, syncAllData };
};
