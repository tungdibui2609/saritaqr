import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, StyleSheet, Vibration } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportOrderApi } from '../api/client';
import { authService } from '../services/auth';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Accelerometer } from 'expo-sensors';
import client from '../api/client';
import ExportStatisticsView from '../components/ExportStatisticsView';

interface ExportOrder {
    id: string;
    date: string;
    warehouse: string;
    locations: string[];
    lotCodes: string[];
    status: string;
    realtimeStatus?: string[]; // "ĐÃ XUẤT" or "S-xx-xx"
}

interface PendingMove {
    id: string; // unique identifier
    exportOrderId: string;
    lotCode: string;
    originalPosition: string;
    targetWarehouse: string;
    movedBy: string;
    timestamp: number;
}



// AsyncStorage keys
const STORAGE_KEYS = {
    OFFLINE_ORDERS: 'work_offline_orders',
    PENDING_MOVES: 'work_pending_moves',
    LAST_SYNC: 'work_last_sync',
};

export default function WorkScreen() {
    const [orders, setOrders] = useState<ExportOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<ExportOrder | null>(null);
    const [movedLots, setMovedLots] = useState<Set<string>>(new Set());

    // Offline Mode States
    const [pendingMoves, setPendingMoves] = useState<PendingMove[]>([]);
    const [lastSyncTime, setLastSyncTime] = useState<string>('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Scanner states
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const isProcessing = useRef(false);

    // State for Feedback Toast
    const [scanFeedback, setScanFeedback] = useState<{ message: string, type: 'success' | 'warning' | 'error' } | null>(null);

    // State for optimization & Tabs
    const [activeTab, setActiveTab] = useState<'stats' | 'scan'>('stats');
    const [isScanning, setIsScanning] = useState(false);
    // const [showWhModal, setShowWhModal] = useState(false);
    // const [targetLot, setTargetLot] = useState<{ lotCode: string, originalPos: string, index: number } | null>(null);
    // const [processingWh, setProcessingWh] = useState(false);

    // Camera Toggle State
    const [isCameraActive, setIsCameraActive] = useState(true);
    const [subscription, setSubscription] = useState<any>(null);

    useEffect(() => {
        _subscribe();
        return () => _unsubscribe();
    }, []);

    const _subscribe = () => {
        setSubscription(
            Accelerometer.addListener(accelerometerData => {
                const { x, y, z } = accelerometerData;
                const acceleration = Math.sqrt(x * x + y * y + z * z);
                if (acceleration > 2.5) {
                    handleShakeDetected();
                }
            })
        );
        Accelerometer.setUpdateInterval(500);
    };

    const _unsubscribe = () => {
        subscription && subscription.remove();
        setSubscription(null);
    };

    const handleShakeDetected = () => {
        Vibration.vibrate([0, 50]);
        setIsCameraActive(prev => {
            const newState = !prev;
            return newState;
        });
    };

    // Load offline data on mount
    useEffect(() => {
        loadOfflineData();
    }, []);

    // Save pending moves whenever they change
    useEffect(() => {
        savePendingMoves();
    }, [pendingMoves]);

    // Keep selectedOrder in sync with orders (for real-time updates)
    useEffect(() => {
        if (selectedOrder && orders.length > 0) {
            const updated = orders.find(o => o.id === selectedOrder.id);
            if (updated && updated !== selectedOrder) {
                // Only update if content matches but ref is different?
                // Actually simply updating it is safer to ensure locations are fresh
                setSelectedOrder(updated);
            }
        }
    }, [orders]);

    // ============ OFFLINE DATA FUNCTIONS ============

    const loadOfflineData = async () => {
        try {
            setLoading(true);

            // Load cached orders
            const savedOrders = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_ORDERS);
            if (savedOrders) {
                const parsed = JSON.parse(savedOrders);
                if (Array.isArray(parsed)) setOrders(parsed);
            }

            // Load pending moves
            const savedMoves = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_MOVES);
            if (savedMoves) {
                const parsed = JSON.parse(savedMoves);
                if (Array.isArray(parsed)) setPendingMoves(parsed);
            }

            // Load last sync time
            const savedSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
            if (savedSync) setLastSyncTime(savedSync);

            // Try to fetch fresh data if online
            await fetchOrders(false); // Don't show loading state since we already set it

        } catch (e) {
            console.error('Load offline data error:', e);
        } finally {
            setLoading(false);
        }
    };

    const savePendingMoves = async () => {
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.PENDING_MOVES, JSON.stringify(pendingMoves));
        } catch (e) {
            console.error('Save pending moves error:', e);
        }
    };

    const saveOrdersToCache = async (ordersData: ExportOrder[]) => {
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_ORDERS, JSON.stringify(ordersData));
        } catch (e) {
            console.error('Save orders cache error:', e);
        }
    };

    // ============ FETCH & DOWNLOAD ============

    const fetchOrders = async (showLoadingIndicator = true) => {
        try {
            if (showLoadingIndicator) setLoading(true);

            // Fetch Orders, Deleted Lots, and ALL Current Positions (to check for Hall status)
            const { default: client } = await import('../api/client');
            const [ordersData, deletedData, positionsData] = await Promise.all([
                exportOrderApi.getList({ status: 'New' }),
                exportOrderApi.getDeletedLots(),
                client.get('/locations/positions')
            ]);

            const fetchedOrders: ExportOrder[] = ordersData.items || [];
            const allPositions = positionsData.data.items || [];

            // Normalize helper
            const norm = (s: string) => (s || "").toString().trim().toUpperCase();

            const deletedSet = new Set<string>();
            (deletedData.items || []).forEach((it: any) => {
                if (it.lotCode) deletedSet.add(norm(it.lotCode));
            });



            // Map current positions: lotCode -> position
            const positionMap: Record<string, string> = {};
            allPositions.forEach((p: any) => {
                if (p.lotCode) positionMap[norm(p.lotCode)] = p.posCode;
            });

            // Process Orders to reflect real-time status
            const processedOrders = fetchedOrders.map(order => {
                const realtimeStatus = new Array(order.lotCodes.length).fill(null);

                order.lotCodes.forEach((lotRaw, idx) => {
                    const lot = norm(lotRaw);

                    // Priority 1: Check if Deleted/Exported
                    if (deletedSet.has(lot)) {
                        realtimeStatus[idx] = "ĐÃ XUẤT";
                    }
                    // Priority 2: Check if currently in Hall (Zone S)
                    else if (positionMap[lot]) {
                        const currentPos = positionMap[lot];
                        if (currentPos && currentPos.startsWith('S-')) {
                            realtimeStatus[idx] = currentPos; // Display actual Hall position e.g. S-01-05
                        }
                    }
                });

                return {
                    ...order,
                    realtimeStatus // New field
                };
            });

            setOrders(processedOrders);
            await saveOrdersToCache(processedOrders);
        } catch (error) {
            console.error('Fetch orders error:', error);
            // Don't show alert if we have cached data
            if (orders.length === 0) {
                Alert.alert('Lỗi', 'Không thể tải danh sách. Đang sử dụng dữ liệu đã lưu.');
            }
        } finally {
            if (showLoadingIndicator) setLoading(false);
        }
    };

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            // Reuse fetchOrders to ensure we get realtimeStatus (Deleted/Moved)
            await fetchOrders(false);

            const now = new Date().toLocaleString('vi-VN');
            setLastSyncTime(now);
            await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, now);

            Alert.alert('Thành công', `Đã tải dữ liệu mới nhất từ server.\nBạn có thể làm việc offline.`);
        } catch (error: any) {
            console.error('Download error:', error);
            Alert.alert('Lỗi', 'Không thể tải dữ liệu. Vui lòng kiểm tra kết nối mạng.');
        } finally {
            setIsDownloading(false);
        }
    };

    // ============ SYNC FUNCTION ============

    // ============ SYNC FUNCTION ============

    const handleSync = async () => {
        if (pendingMoves.length === 0) {
            Alert.alert('Thông báo', 'Không có thao tác nào cần đồng bộ.');
            return;
        }

        setIsSyncing(true);
        try {
            // 1. Fetch Deleted/Exported lots
            const deletedRes = await exportOrderApi.getDeletedLots();
            const deletedSet = new Set<string>((deletedRes.items || []).map((it: any) => it.lotCode));

            // Moved set is no longer tracked via API
            // const movedSet = new Set<string>();

            // 2. Identify moves properly
            const movesToProcess: PendingMove[] = [];
            const alreadyExported: string[] = [];
            // const alreadyMoved: string[] = [];

            pendingMoves.forEach(m => {
                if (deletedSet.has(m.lotCode)) {
                    alreadyExported.push(m.lotCode);
                } else {
                    movesToProcess.push(m);
                }
            });

            // If everything is already exported or moved, we can just clear them and notify
            if (movesToProcess.length === 0) {
                setPendingMoves([]);
                const now = new Date().toLocaleString('vi-VN');
                setLastSyncTime(now);
                await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, now);

                let skippedMsg = '';
                if (alreadyExported.length > 0) skippedMsg += `\n• ${alreadyExported.length} LOT đã xuất kho.`;

                Alert.alert(
                    'Đồng bộ hoàn tất',
                    `Tất cả thao tác đã được thực hiện bởi người khác.${skippedMsg}`
                );
                setIsSyncing(false);
                await fetchOrders(false);
                return;
            }

            // 3. Process remaining moves (Deterministic & Batched)
            const { formatCode } = await import('../lib/locationCodes');
            const { default: client } = await import('../api/client'); // Need direct client access for positions

            // A. Fetch ALL occupied positions first
            const resPos = await client.get('/locations/positions');
            const occupied = resPos.data.items || [];
            const occupiedSet = new Set(occupied.map((it: any) => it.posCode));

            const results: { success: boolean; lotCode: string; error?: string }[] = [];

            // Helper to get next empty spots
            const getNextEmptyHallSpots = (whId: number, count: number, exclude: Set<string>): string[] => {
                const spots: string[] = [];
                // Check positions 1..100 to be safe
                for (let i = 1; i <= 100; i++) {
                    const code = formatCode({ warehouse: whId as any, zone: 'S', pos: i, capacity: 1 });
                    if (!occupiedSet.has(code) && !exclude.has(code)) {
                        spots.push(code);
                        if (spots.length >= count) break;
                    }
                }
                return spots;
            };

            // Group moves by Warehouse to optimize spot finding
            // But we process in order of pendingMoves to maintain FIFO if important? 
            // Actually batching by warehouse might be complex if interspersed. 
            // Let's just process linearly, finding spots as we go.
            // We need a local 'usedSpots' to track what we assign in this session.
            const usedHallSpots = new Set<string>();

            // B. Process in Batches
            const BATCH_SIZE = 5;
            const DELAY_MS = 500;

            // Split movesToProcess into chunks
            for (let i = 0; i < movesToProcess.length; i += BATCH_SIZE) {
                const batch = movesToProcess.slice(i, i + BATCH_SIZE);

                // Prepare Promises
                const batchPromises = batch.map(async (move) => {
                    let whId = parseInt(move.targetWarehouse);
                    let toPos = "";
                    let targetWhFound = 0;

                    // Logic AUTO: Find empty spot in Wh 1 -> 2 -> 3
                    if (isNaN(whId) || move.targetWarehouse === 'AUTO') {
                        // Check Wh 1
                        let spots = getNextEmptyHallSpots(1, 1, usedHallSpots);
                        if (spots.length > 0) {
                            toPos = spots[0];
                            targetWhFound = 1;
                        } else {
                            // Check Wh 2
                            spots = getNextEmptyHallSpots(2, 1, usedHallSpots);
                            if (spots.length > 0) {
                                toPos = spots[0];
                                targetWhFound = 2;
                            } else {
                                // Check Wh 3
                                spots = getNextEmptyHallSpots(3, 1, usedHallSpots);
                                if (spots.length > 0) {
                                    toPos = spots[0];
                                    targetWhFound = 3;
                                }
                            }
                        }

                        if (!toPos) {
                            return { success: false, lotCode: move.lotCode, error: `Hết chỗ trống ở cả 3 Kho.` };
                        }
                    } else {
                        // Specific Warehouse Logic
                        const spots = getNextEmptyHallSpots(whId, 1, usedHallSpots);

                        if (spots.length === 0) {
                            return { success: false, lotCode: move.lotCode, error: `Kho ${whId} hết chỗ Sảnh (đã thử 100 vị trí)` };
                        }
                        toPos = spots[0];
                        targetWhFound = whId;
                    }

                    usedHallSpots.add(toPos); // Mark as used for next iterations

                    try {
                        await exportOrderApi.moveToHall(move.originalPosition, toPos, move.lotCode, move.movedBy);
                        return { success: true, lotCode: move.lotCode };
                    } catch (e: any) {
                        const is404 = e.response?.status === 404 || e.message?.includes('404');
                        if (is404) {
                            return { success: true, lotCode: move.lotCode, error: 'Recovered' };
                        }
                        return { success: false, lotCode: move.lotCode, error: e.response?.data?.message || e.message || 'Lỗi mạng' };
                    }
                });

                // Execute Batch
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // Delay if there are more batches
                if (i + BATCH_SIZE < movesToProcess.length) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                }
            }

            // Results and Cleanup
            const successCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;
            const successfulLots = results.filter(r => r.success).map(r => r.lotCode);

            // Clear pending valid moves + already exported
            const allCleared = [...successfulLots, ...alreadyExported];
            if (allCleared.length > 0) {
                setPendingMoves(prev => prev.filter(m => !allCleared.includes(m.lotCode)));
                const now = new Date().toLocaleString('vi-VN');
                setLastSyncTime(now);
                await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, now);
            }

            // Report
            let msg = '';
            if (successCount > 0) msg += `✅ Hạ sảnh thành công: ${successCount}\n`;
            if (alreadyExported.length > 0) msg += `⚠️ Đã được xuất kho (bỏ qua): ${alreadyExported.length}\n`;
            if (failedCount > 0) msg += `❌ Thất bại: ${failedCount}`;

            if (failedCount > 0) {
                const failedDetails = results.filter(r => !r.success).map(r => `${r.lotCode}: ${r.error}`).join('\n');
                Alert.alert('Đồng bộ một phần', `${msg}\n\nChi tiết lỗi:\n${failedDetails}`);
            } else {
                Alert.alert('Đồng bộ hoàn tất', msg.trim() || "Thành công");
            }

            await fetchOrders(false);

        } catch (error: any) {
            console.error('Sync error:', error);
            Alert.alert('Lỗi', error.message || 'Không thể đồng bộ. Vui lòng thử lại.');
        } finally {
            setIsSyncing(false);
        }
    };

    // ============ ORDER SELECTION ============

    const handleSelectOrder = async (order: ExportOrder) => {
        if (!permission?.granted) {
            const res = await requestPermission();
            if (!res.granted) {
                Alert.alert('Quyền truy cập', 'Vui lòng cho phép quyền camera để quét mã');
                return;
            }
        }
        setSelectedOrder(order);

        // Check for already moved LOTs (from pending moves)
        const alreadyMoved = new Set<string>();
        pendingMoves.forEach(m => {
            if (m.exportOrderId === order.id) {
                alreadyMoved.add(m.lotCode);
            }
        });
        setMovedLots(alreadyMoved);
        setMovedLots(alreadyMoved);
        setScanned(false);
        setActiveTab('stats'); // Default to statistics tab
        setIsScanning(false);
    };

    // ============ BARCODE SCANNING ============

    // Helper for Feedback
    const showFeedback = (message: string, type: 'success' | 'warning' | 'error') => {
        setScanFeedback({ message, type });
        // Auto dismiss and reset scan
        setTimeout(() => {
            setScanFeedback(null);
            setScanned(false);
            isProcessing.current = false;
        }, 1500); // 1.5s visible time
    };

    const onBarcodeScanned = async ({ data }: { data: string }) => {
        if (scanned || !selectedOrder || isProcessing.current) return;
        isProcessing.current = true;
        setScanned(true);

        // Parse URL nếu quét từ QR code web (dạng http://domain/qr/LOT-CODE?...)
        let code = data.trim();
        if (code.includes('/qr/')) {
            try {
                const url = new URL(code);
                const pathParts = url.pathname.split('/');
                const qrIndex = pathParts.indexOf('qr');
                if (qrIndex !== -1 && pathParts[qrIndex + 1]) {
                    code = decodeURIComponent(pathParts[qrIndex + 1]);
                }
            } catch (e) { }
        }

        const lotIndex = selectedOrder.lotCodes.indexOf(code);
        if (lotIndex === -1) {
            Vibration.vibrate([0, 50, 50, 50]); // Error vibe
            showFeedback(`Mã "${code}"\nkhông thuộc lệnh xuất này`, 'error');
            return;
        }

        if (movedLots.has(code)) {
            Vibration.vibrate();
            showFeedback('LOT này đã quét rồi!', 'warning');
            return;
        }

        // AUTO SAVE Logic (Streamlined)
        try {
            const user = await authService.getUser();
            const userName = user?.username || 'mobile_user';
            const targetLotInfo = { lotCode: code, originalPos: selectedOrder.locations[lotIndex], index: lotIndex };

            const newMove: PendingMove = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                exportOrderId: selectedOrder.id,
                lotCode: targetLotInfo.lotCode,
                originalPosition: targetLotInfo.originalPos,
                targetWarehouse: 'AUTO', // Auto assign
                movedBy: userName,
                timestamp: Date.now(),
            };

            setPendingMoves(prev => [...prev, newMove]);
            setMovedLots(new Set([...movedLots, targetLotInfo.lotCode]));

            Vibration.vibrate(100); // Success vibe
            showFeedback(`Đã lưu: ${code}`, 'success');

        } catch (e) {
            console.error(e);
            showFeedback('Lỗi lưu trữ', 'error');
        }
    };

    // ============ LOADING STATE ============

    if (loading && orders.length === 0) {
        return (
            <View className="flex-1 bg-zinc-50 justify-center items-center">
                <ActivityIndicator size="large" color="#2563eb" />
                <Text className="mt-4 text-zinc-400 font-medium">Đang tải lệnh xuất kho...</Text>
            </View>
        );
    }

    if (selectedOrder) {
        return (
            <View className="flex-1 bg-zinc-50">
                {/* Header with Tabs */}
                <View className="bg-white pt-12 pb-0 px-0 border-b border-zinc-200 shadow-sm z-20">
                    <View className="px-5 pb-4 flex-row justify-between items-center">
                        <View className="flex-row items-center">
                            <TouchableOpacity onPress={() => setSelectedOrder(null)} className="mr-3">
                                <Feather name="chevron-left" size={28} color="#18181b" />
                            </TouchableOpacity>
                            <View>
                                <Text className="text-[10px] font-black text-blue-600 uppercase tracking-[2px]">SARITA • WORK</Text>
                                <Text className="font-black text-2xl text-zinc-900 tracking-tight">Hạ Sảnh</Text>
                            </View>
                        </View>
                        <View className="bg-zinc-100 px-3 py-1 rounded-lg border border-zinc-200">
                            <Text className="text-zinc-900 font-black text-xs">{selectedOrder.id}</Text>
                        </View>
                    </View>

                    {/* Tab Bar */}
                    <View className="flex-row border-b border-zinc-200 mt-2">
                        <TouchableOpacity
                            onPress={() => { setActiveTab('stats'); setIsScanning(false); }}
                            className={`flex-1 pb-3 pt-2 border-b-2 items-center justify-center ${activeTab === 'stats' ? 'border-blue-600' : 'border-transparent'}`}
                        >
                            <Text className={`font-black text-sm uppercase ${activeTab === 'stats' ? 'text-blue-600' : 'text-zinc-400'}`}>
                                Thống kê
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveTab('scan')}
                            className={`flex-1 pb-3 pt-2 border-b-2 items-center justify-center flex-row gap-2 ${activeTab === 'scan' ? 'border-blue-600' : 'border-transparent'}`}
                        >
                            <Text className={`font-black text-sm uppercase ${activeTab === 'scan' ? 'text-blue-600' : 'text-zinc-400'}`}>
                                Quét mã
                            </Text>
                            {pendingMoves.filter(m => m.exportOrderId === selectedOrder.id).length > 0 && (
                                <View className="bg-amber-500 px-1.5 py-0.5 rounded-full">
                                    <Text className="text-white font-black text-[9px]">
                                        {pendingMoves.filter(m => m.exportOrderId === selectedOrder.id).length}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Content */}
                {activeTab === 'stats' ? (
                    <ExportStatisticsView order={selectedOrder} />
                ) : (
                    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                        <View className="px-6 pt-6">
                            {/* Camera Box */}
                            <View className="h-80 w-full bg-black relative rounded-xl overflow-hidden shadow-sm border-4 border-white mb-6">
                                {isCameraActive ? (
                                    <CameraView
                                        style={StyleSheet.absoluteFillObject}
                                        facing="back"
                                        onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
                                        barcodeScannerSettings={{
                                            barcodeTypes: ['qr', 'code128'],
                                        }}
                                    />
                                ) : (
                                    <View className="flex-1 items-center justify-center bg-zinc-900">
                                        <Feather name="video-off" size={48} color="#52525b" />
                                        <Text className="text-zinc-500 font-bold mt-4">Camera đang tắt</Text>
                                        <Text className="text-zinc-600 text-xs mt-1">Lắc máy để bật lại</Text>
                                    </View>
                                )}

                                <View className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded">
                                    <Text className={`text-[10px] font-medium ${isCameraActive ? 'text-green-400' : 'text-zinc-500'}`}>
                                        {isCameraActive ? 'LIVE' : 'PAUSED'}
                                    </Text>
                                </View>

                                {/* FEEDBACK TOAST OVERLAY */}
                                {scanFeedback && (
                                    <View className="absolute inset-x-4 top-1/2 -mt-10 items-center justify-center pointer-events-none z-50">
                                        <View className={`px-6 py-4 rounded-2xl shadow-lg items-center ${scanFeedback.type === 'success' ? 'bg-emerald-500' :
                                                scanFeedback.type === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                                            }`}>
                                            <Feather
                                                name={scanFeedback.type === 'success' ? "check-circle" : "alert-triangle"}
                                                size={32}
                                                color="white"
                                                style={{ marginBottom: 8 }}
                                            />
                                            <Text className="text-white font-black text-center text-lg shadow-sm">
                                                {scanFeedback.message}
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                <TouchableOpacity
                                    onPress={() => setIsCameraActive(!isCameraActive)}
                                    className="absolute bottom-2 left-2 p-2 bg-black/40 rounded-full"
                                >
                                    <Feather name={isCameraActive ? "pause" : "play"} size={16} color="white" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setIsScanning(true)} // Keep maximization or just default
                                    className="absolute top-2 right-2 p-2 bg-black/40 rounded-full"
                                >
                                    <Feather name="maximize-2" size={20} color="white" />
                                </TouchableOpacity>
                            </View>

                            {/* Instruction */}
                            <View className="items-center justify-center py-6">
                                <Text className="text-zinc-400 text-center px-10 text-xs font-medium leading-5">
                                    Quét mã LOT và chọn kho để ghi nhận thao tác.{"\n"}Thao tác sẽ được đồng bộ khi có mạng.
                                </Text>
                            </View>

                            {/* LOT List */}
                            <View className="mt-2">
                                <View className="flex-row justify-between items-center mb-4 px-2">
                                    <Text className="font-black text-zinc-400 text-[10px] uppercase tracking-widest">Danh sách Pallet</Text>
                                    <Text className="text-blue-600 font-black text-xs">{movedLots.size} / {selectedOrder.lotCodes.length}</Text>
                                </View>

                                {selectedOrder.lotCodes.map((lot, idx) => {
                                    const isPending = pendingMoves.some(m => m.exportOrderId === selectedOrder.id && m.lotCode === lot);
                                    const status = selectedOrder.realtimeStatus?.[idx];
                                    const isExported = status === "ĐÃ XUẤT";
                                    const isMoved = status && !isExported;

                                    return (
                                        <View key={`${lot}-${idx}`}
                                            className={`mb-3 p-4 rounded-[28px] border ${movedLots.has(lot) ? (isPending ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-100') : 'bg-white border-zinc-100'} shadow-sm flex-row items-center justify-between`}
                                        >
                                            <View className="flex-1">
                                                <Text className="text-zinc-400 font-black text-[9px] uppercase">LOT #{idx + 1}</Text>
                                                <Text className={`text-base font-black ${movedLots.has(lot) ? (isPending ? 'text-amber-700' : 'text-emerald-700') : 'text-zinc-900'}`}>{lot}</Text>

                                                <View className="flex-row items-center gap-2 mt-1">
                                                    <Text className="text-zinc-500 text-[10px] font-medium">Vị trí: {selectedOrder.locations[idx]}</Text>

                                                    {isExported && (
                                                        <View className="bg-red-100 px-2 py-0.5 rounded-md">
                                                            <Text className="text-red-700 font-bold text-[9px]">ĐÃ XUẤT</Text>
                                                        </View>
                                                    )}

                                                    {isMoved && (
                                                        <View className="bg-blue-100 px-2 py-0.5 rounded-md flex-row items-center gap-1">
                                                            <Feather name="arrow-right" size={8} color="#1d4ed8" />
                                                            <Text className="text-blue-700 font-bold text-[9px]">{status}</Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>
                                            {movedLots.has(lot) && (
                                                <View className={`${isPending ? 'bg-amber-500' : 'bg-emerald-500'} w-8 h-8 rounded-full items-center justify-center`}>
                                                    <Feather name={isPending ? "clock" : "check"} size={18} color="white" />
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    </ScrollView>
                )}


            </View>
        );
    }

    // ============ MAIN ORDER LIST VIEW ============

    return (
        <View className="flex-1 bg-zinc-50">
            {/* Header */}
            <View className="bg-white pt-14 pb-6 px-6 border-b border-zinc-100 shadow-sm z-20">
                <Text className="text-[10px] font-black text-blue-600 uppercase tracking-[2px]">Sarita Workspace</Text>
                <View className="flex-row justify-between items-end mt-1">
                    <View>
                        <Text className="font-black text-3xl text-zinc-900 tracking-tighter">Công Việc</Text>
                        {lastSyncTime && (
                            <Text className="text-zinc-400 text-[10px] font-medium mt-1">Cập nhật: {lastSyncTime}</Text>
                        )}
                    </View>
                    <View className="flex-row gap-2">
                        {/* Download Button */}
                        <TouchableOpacity
                            onPress={handleDownload}
                            disabled={isDownloading}
                            className="bg-blue-600 px-3 py-2 rounded-xl flex-row items-center gap-1.5"
                        >
                            {isDownloading ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <Feather name="download-cloud" size={16} color="white" />
                            )}
                            <Text className="text-white font-black text-xs">Tải</Text>
                        </TouchableOpacity>

                        {/* Sync Button */}
                        <TouchableOpacity
                            onPress={handleSync}
                            disabled={isSyncing || pendingMoves.length === 0}
                            className={`px-3 py-2 rounded-xl flex-row items-center gap-1.5 ${pendingMoves.length > 0 ? 'bg-amber-500' : 'bg-zinc-200'}`}
                        >
                            {isSyncing ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <Feather name="upload-cloud" size={16} color={pendingMoves.length > 0 ? "white" : "#a1a1aa"} />
                            )}
                            <Text className={`font-black text-xs ${pendingMoves.length > 0 ? 'text-white' : 'text-zinc-400'}`}>
                                {pendingMoves.length > 0 ? `Sync (${pendingMoves.length})` : 'Sync'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                {/* Pending Sync Notice */}
                {pendingMoves.length > 0 && (
                    <View className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex-row items-center gap-3">
                        <View className="w-10 h-10 bg-amber-500 rounded-full items-center justify-center">
                            <Feather name="clock" size={20} color="white" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-amber-800 font-black text-sm">{pendingMoves.length} thao tác chờ đồng bộ</Text>
                            <Text className="text-amber-600 text-xs font-medium">Nhấn "Sync" để gửi lên server</Text>
                        </View>
                    </View>
                )}

                <Text className="font-black text-zinc-400 text-[10px] uppercase tracking-[2px] mb-4 ml-1">Lệnh xuất kho ({orders.length})</Text>

                {orders.length === 0 ? (
                    <View className="items-center justify-center py-20 opacity-40">
                        <MaterialCommunityIcons name="clipboard-text-search-outline" size={64} color="#d4d4d8" />
                        <Text className="mt-4 font-black text-zinc-400 uppercase tracking-widest text-xs">Không có lệnh mới</Text>
                        <Text className="mt-2 text-zinc-400 text-xs text-center">Nhấn "Tải" để download dữ liệu</Text>
                    </View>
                ) : (
                    orders.map(order => {
                        const orderPendingCount = pendingMoves.filter(m => m.exportOrderId === order.id).length;
                        return (
                            <TouchableOpacity
                                key={order.id}
                                onPress={() => handleSelectOrder(order)}
                                className="mb-4 bg-white rounded-[32px] border border-zinc-100 shadow-xl shadow-zinc-200 overflow-hidden"
                            >
                                <View className="flex-row items-center p-5">
                                    <LinearGradient
                                        colors={orderPendingCount > 0 ? ['#f59e0b', '#fbbf24'] : ['#059669', '#10b981']}
                                        style={{ width: 64, height: 64, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    >
                                        <Feather name={orderPendingCount > 0 ? "clock" : "truck"} size={30} color="white" />
                                    </LinearGradient>

                                    <View className="flex-1 ml-4">
                                        <Text className="text-zinc-900 font-black text-lg leading-6">{order.id}</Text>
                                        <Text className="text-zinc-400 font-medium text-xs mt-0.5">Kho {order.warehouse} • {order.date}</Text>
                                    </View>

                                    <View className="items-end gap-1">
                                        <View className="bg-blue-50 px-3 py-1.5 rounded-2xl border border-blue-100">
                                            <Text className="text-blue-700 font-black text-sm">{order.lotCodes.length} LOT</Text>
                                        </View>
                                        {orderPendingCount > 0 && (
                                            <View className="bg-amber-100 px-2 py-0.5 rounded-full">
                                                <Text className="text-amber-700 font-black text-[10px]">{orderPendingCount} chờ</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );
}
