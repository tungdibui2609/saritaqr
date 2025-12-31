import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, StyleSheet, Vibration } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportOrderApi } from '../api/client';
import { authService } from '../services/auth';
import { CameraView, useCameraPermissions } from 'expo-camera';
import client from '../api/client';
import ExportStatisticsView from '../components/ExportStatisticsView';

interface ExportOrder {
    id: string;
    date: string;
    warehouse: string;
    locations: string[];
    lotCodes: string[];
    status: string;
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

    // State for optimization & Tabs
    const [activeTab, setActiveTab] = useState<'stats' | 'scan'>('stats');
    const [isScanning, setIsScanning] = useState(false);
    const [showWhModal, setShowWhModal] = useState(false);
    const [targetLot, setTargetLot] = useState<{ lotCode: string, originalPos: string, index: number } | null>(null);
    const [processingWh, setProcessingWh] = useState(false);

    // Load offline data on mount
    useEffect(() => {
        loadOfflineData();
    }, []);

    // Save pending moves whenever they change
    useEffect(() => {
        savePendingMoves();
    }, [pendingMoves]);

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
            const data = await exportOrderApi.getList({ status: 'New' });
            const fetchedOrders = data.items || [];
            setOrders(fetchedOrders);
            await saveOrdersToCache(fetchedOrders);
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
            const data = await exportOrderApi.getList({ status: 'New' });
            const fetchedOrders = data.items || [];
            setOrders(fetchedOrders);
            await saveOrdersToCache(fetchedOrders);

            const now = new Date().toLocaleString('vi-VN');
            setLastSyncTime(now);
            await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, now);

            Alert.alert('Thành công', `Đã tải ${fetchedOrders.length} lệnh xuất kho về máy.\nBạn có thể làm việc offline.`);
        } catch (error: any) {
            console.error('Download error:', error);
            Alert.alert('Lỗi', 'Không thể tải dữ liệu. Vui lòng kiểm tra kết nối mạng.');
        } finally {
            setIsDownloading(false);
        }
    };

    // ============ SYNC FUNCTION ============

    const handleSync = async () => {
        if (pendingMoves.length === 0) {
            Alert.alert('Thông báo', 'Không có thao tác nào cần đồng bộ.');
            return;
        }

        setIsSyncing(true);
        try {
            const response = await client.post('/work/sync', {
                moves: pendingMoves.map(m => ({
                    exportOrderId: m.exportOrderId,
                    lotCode: m.lotCode,
                    originalPosition: m.originalPosition,
                    targetWarehouse: m.targetWarehouse,
                    movedBy: m.movedBy,
                    timestamp: m.timestamp,
                }))
            });

            if (response.data.ok) {
                const { success, failed, results } = response.data;

                // Remove successful moves from pending
                const successfulLots = results.filter((r: any) => r.success).map((r: any) => r.lotCode);
                setPendingMoves(prev => prev.filter(m => !successfulLots.includes(m.lotCode)));

                const now = new Date().toLocaleString('vi-VN');
                setLastSyncTime(now);
                await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, now);

                if (failed > 0) {
                    const failedDetails = results.filter((r: any) => !r.success).map((r: any) => `${r.lotCode}: ${r.error}`).join('\n');
                    Alert.alert('Đồng bộ một phần', `Thành công: ${success}\nThất bại: ${failed}\n\nChi tiết:\n${failedDetails}`);
                } else {
                    Alert.alert('Thành công', `Đã đồng bộ ${success} thao tác hạ sảnh lên server.`);
                }

                // Refresh orders
                await fetchOrders(false);
            } else {
                Alert.alert('Lỗi', response.data.error || 'Đồng bộ thất bại');
            }
        } catch (error: any) {
            console.error('Sync error:', error);
            Alert.alert('Lỗi kết nối', 'Không thể đồng bộ. Vui lòng thử lại khi có mạng.');
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

    const onBarcodeScanned = ({ data }: { data: string }) => {
        if (scanned || !selectedOrder || showWhModal || isProcessing.current) return;
        isProcessing.current = true;
        setScanned(true);
        Vibration.vibrate();

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
            } catch (e) {
                // Fallback: nếu không parse được URL, giữ nguyên code
            }
        }

        const lotIndex = selectedOrder.lotCodes.indexOf(code);
        if (lotIndex === -1) {
            Alert.alert('Lỗi', `Mã LOT "${code}" không thuộc lệnh xuất hiện tại`, [
                { text: 'OK', onPress: () => { setScanned(false); isProcessing.current = false; } }
            ]);
            return;
        }

        if (movedLots.has(code)) {
            Alert.alert('Thông báo', 'LOT này đã được hạ sảnh rồi', [
                { text: 'OK', onPress: () => { setScanned(false); isProcessing.current = false; } }
            ]);
            return;
        }

        setTargetLot({ lotCode: code, originalPos: selectedOrder.locations[lotIndex], index: lotIndex });
        setShowWhModal(true);
    };

    // ============ CONFIRM WAREHOUSE (OFFLINE MODE) ============

    const handleConfirmWh = async (whId: string) => {
        if (!targetLot || !selectedOrder) return;

        try {
            setProcessingWh(true);
            const user = await authService.getUser();
            const userName = user?.username || 'mobile_user';

            // Create pending move (save locally)
            const newMove: PendingMove = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                exportOrderId: selectedOrder.id,
                lotCode: targetLot.lotCode,
                originalPosition: targetLot.originalPos,
                targetWarehouse: whId,
                movedBy: userName,
                timestamp: Date.now(),
            };

            setPendingMoves(prev => [...prev, newMove]);
            setMovedLots(new Set([...movedLots, targetLot.lotCode]));

            Alert.alert(
                'Đã ghi nhận (Offline)',
                `LOT ${targetLot.lotCode} sẽ được hạ sảnh vào Kho ${whId}.\nNhấn "Đồng bộ" khi có mạng để hoàn tất.`
            );

            setShowWhModal(false);
            setTargetLot(null);
        } catch (error: any) {
            console.error('Confirm WH error:', error);
            Alert.alert('Lỗi', 'Không thể ghi nhận thao tác');
        } finally {
            setProcessingWh(false);
            setScanned(false);
            isProcessing.current = false;
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
                                {isScanning ? (
                                    <>
                                        <CameraView
                                            style={StyleSheet.absoluteFillObject}
                                            facing="back"
                                            onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
                                            barcodeScannerSettings={{
                                                barcodeTypes: ['qr', 'code128'],
                                            }}
                                        />
                                        <View className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded">
                                            <Text className="text-white text-[10px] font-medium">Live Camera</Text>
                                        </View>
                                        <View className="absolute top-2 right-2 p-2 bg-black/40 rounded-full">
                                            <Feather name="maximize-2" size={20} color="white" />
                                        </View>
                                    </>
                                ) : (
                                    <View className="flex-1 items-center justify-center bg-zinc-900">
                                        <View className="w-20 h-20 bg-zinc-800 rounded-full items-center justify-center mb-4">
                                            <Feather name="camera-off" size={32} color="#71717a" />
                                        </View>
                                        <Text className="text-zinc-500 font-medium mb-6 text-center px-10">
                                            Camera đang tắt để tiết kiệm pin
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => setIsScanning(true)}
                                            className="bg-blue-600 px-6 py-3 rounded-2xl flex-row items-center gap-2"
                                        >
                                            <Feather name="camera" size={20} color="white" />
                                            <Text className="text-white font-bold">Bắt đầu quét</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
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
                                    return (
                                        <View key={`${lot}-${idx}`}
                                            className={`mb-3 p-4 rounded-[28px] border ${movedLots.has(lot) ? (isPending ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-100') : 'bg-white border-zinc-100'} shadow-sm flex-row items-center justify-between`}
                                        >
                                            <View className="flex-1">
                                                <Text className="text-zinc-400 font-black text-[9px] uppercase">LOT #{idx + 1}</Text>
                                                <Text className={`text-base font-black ${movedLots.has(lot) ? (isPending ? 'text-amber-700' : 'text-emerald-700') : 'text-zinc-900'}`}>{lot}</Text>
                                                <Text className="text-zinc-500 text-[10px] font-medium mt-0.5">Vị trí: {selectedOrder.locations[idx]}</Text>
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

                {/* Warehouse Modal */}
                <Modal visible={showWhModal} transparent animationType="fade">
                    <View className="flex-1 bg-black/60 justify-center px-6">
                        <View className="bg-white rounded-[40px] p-8 shadow-2xl">
                            <View className="items-center mb-6">
                                <View className="w-16 h-16 bg-blue-50 rounded-3xl items-center justify-center mb-4">
                                    <MaterialCommunityIcons name="warehouse" size={32} color="#2563eb" />
                                </View>
                                <Text className="text-zinc-400 font-black text-[10px] uppercase tracking-widest mb-1 text-center">Chọn kho hạ sảnh</Text>
                                <Text className="text-2xl font-black text-zinc-900 text-center">LOT: {targetLot?.lotCode}</Text>
                            </View>

                            <Text className="text-zinc-500 text-center mb-6 font-medium text-sm">Thao tác sẽ được lưu offline và đồng bộ sau:</Text>

                            <View className="gap-3">
                                {[1, 2, 3].map((wh) => (
                                    <TouchableOpacity
                                        key={wh}
                                        onPress={() => handleConfirmWh(wh.toString())}
                                        disabled={processingWh}
                                        className="bg-zinc-50 border border-zinc-100 p-5 rounded-3xl flex-row items-center justify-between"
                                    >
                                        <Text className="text-zinc-900 font-black text-lg">Kho {wh}</Text>
                                        <Feather name="chevron-right" size={20} color="#d4d4d8" />
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <TouchableOpacity
                                onPress={() => { setShowWhModal(false); setTargetLot(null); setScanned(false); isProcessing.current = false; }}
                                className="mt-6 py-2 items-center"
                                disabled={processingWh}
                            >
                                <Text className="text-zinc-400 font-black text-xs uppercase tracking-widest">Hủy bỏ</Text>
                            </TouchableOpacity>

                            {processingWh && (
                                <View className="absolute inset-0 bg-white/90 items-center justify-center rounded-[40px]">
                                    <ActivityIndicator size="large" color="#2563eb" />
                                    <Text className="mt-4 font-black text-zinc-900">Đang lưu...</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </Modal>
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
