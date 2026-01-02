import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, Vibration, Modal, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import client from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

interface LotLine {
    lotCode: string;
    productCode: string;
    productName: string;
    productType?: string;
    quantity: number;
    unit: string;
    imageUrl?: string;
    // Local state for UI
    exportQty?: string; // String for input
}

interface LotHeader {
    peelDate?: string;
    packDate?: string;
    qc?: string;
}

import { AppFooter } from '../components/AppFooter';
import { Accelerometer } from 'expo-sensors';
import { useDataSync } from '../hooks/useDataSync';
import { useOfflineLookup } from '../hooks/useOfflineLookup';

export default function ExportScreen() {
    const { isDownloading: isDownloadingGlobal, lastUpdated, syncAllData } = useDataSync();
    const { isReady: isOfflineReady, lookupLot } = useOfflineLookup();
    const [permission, requestPermission] = useCameraPermissions();
    const [showScanner, setShowScanner] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [lotCode, setLotCode] = useState<string | null>(null);
    const [lines, setLines] = useState<LotLine[]>([]);
    const [header, setHeader] = useState<LotHeader | null>(null);
    const [mode, setMode] = useState<'FULL' | 'PARTIAL'>('FULL');
    const [reason, setReason] = useState('');
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'error' }>({ visible: false, message: '', type: 'success' });
    const toastTimer = useRef<NodeJS.Timeout | null>(null);
    const isProcessing = useRef(false);

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
            showToast(newState ? "Đã bật Camera" : "Đã tắt Camera (Tiết kiệm pin)", "info");
            return newState;
        });
    };

    const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ visible: true, message, type });
        toastTimer.current = setTimeout(() => {
            setToast(prev => ({ ...prev, visible: false }));
        }, 3000);
    };

    const fetchLotDetails = async (code: string) => {
        setLoading(true);
        try {
            const res = await client.get(`/lots/${encodeURIComponent(code)}/lines`);
            if (res.data.items && res.data.items.length > 0) {
                setLotCode(code);
                setLines(res.data.items.map((line: any) => ({
                    ...line,
                    exportQty: line.quantity.toString() // Default to full qty
                })));
                setHeader(res.data.header || null);
                showToast(`Đã tải LOT: ${code}`, 'success');
            } else {
                showToast(`Không tìm thấy LOT: ${code}`, 'error');
                setLotCode(null);
                setLines([]);
                setHeader(null);
            }
        } catch (e: any) {
            console.log("Online fetch failed, trying offline...", e);
            if (isOfflineReady) {
                const offlineData = lookupLot(code);
                if (offlineData) {
                    setLotCode(code);
                    // Construct a single line item from offline data
                    setLines([{
                        lotCode: code,
                        productCode: offlineData.productCode,
                        productName: offlineData.productName,
                        quantity: offlineData.quantity,
                        unit: offlineData.unit,
                        exportQty: '', // Force manual entry for accuracy
                    }]);
                    setHeader(null);
                    showToast(`Đã tìm thấy LOT (Offline): ${code}`, 'success');
                } else {
                    showToast(`Không tìm thấy LOT: ${code} (Offline)`, 'error');
                    setLotCode(null);
                    setLines([]);
                }
            } else {
                showToast("Lỗi kết nối và chưa có dữ liệu Offline", "error");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleScan = ({ data }: { data: string }) => {
        if (isProcessing.current) return;
        isProcessing.current = true;
        Vibration.vibrate();

        let code = data.trim();
        // Handle URL parse if scanned from web QR
        if (code.includes('/qr/')) {
            try {
                const url = new URL(code);
                const pathParts = url.pathname.split('/');
                const qrIndex = pathParts.indexOf('qr');
                if (qrIndex !== -1 && pathParts[qrIndex + 1]) {
                    code = pathParts[qrIndex + 1];
                }
            } catch (e) { }
        }

        fetchLotDetails(code);
        setShowScanner(false);
        setTimeout(() => { isProcessing.current = false; }, 1000);
    };

    const handleExport = async () => {
        if (!lotCode) return;
        if (!reason.trim()) {
            Alert.alert('Thông báo', 'Vui lòng nhập lý do xuất kho để tiếp tục.');
            return;
        }

        setIsExporting(true);
        try {
            const userName = await AsyncStorage.getItem('userName') || '';

            const payload: any = {
                lotCode,
                deletedBy: userName,
                mode,
                reason,
            };

            if (mode === 'PARTIAL') {
                payload.items = lines.map((line, index) => ({
                    lineIndex: index,
                    quantity: parseFloat(line.exportQty || '0'),
                    unit: line.unit
                })).filter(item => item.quantity > 0);

                if (payload.items.length === 0) {
                    Alert.alert('Lỗi', 'Vui lòng nhập số lượng cần xuất cho ít nhất 1 mặt hàng');
                    setIsExporting(false);
                    return;
                }
            }

            const res = await client.post('/lots/export', payload);
            if (res.data.ok) {
                Alert.alert('🎉 Thành công', res.data.message || 'Đã xuất kho thành công hồ sơ này.', [
                    { text: 'Tuyệt vời', style: 'default' }
                ]);
                // Reset state
                setLotCode(null);
                setLines([]);
                setHeader(null);
                setReason('');
                setMode('FULL');
            } else {
                throw new Error(res.data.error || 'EXPORT_FAILED');
            }
        } catch (e: any) {
            console.error(e);
            Alert.alert('Lỗi xuất kho', e.response?.data?.error || e.message || 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.');
        } finally {
            setIsExporting(false);
        }
    };

    const updateLineQty = (index: number, val: string) => {
        const newLines = [...lines];
        // Allow numeric and decimal
        const cleanVal = val.replace(/[^0-9.]/g, '');
        newLines[index].exportQty = cleanVal;
        setLines(newLines);
    };

    if (!permission) return <View className="flex-1 bg-zinc-50" />;
    if (!permission.granted) {
        return (
            <View className="flex-1 justify-center items-center p-8 bg-white">
                <View className="w-24 h-24 bg-rose-50 rounded-full items-center justify-center mb-6">
                    <Feather name="camera-off" size={40} color="#e11d48" />
                </View>
                <Text className="text-2xl font-black text-zinc-900 text-center mb-2">Quyền Camera</Text>
                <Text className="text-center text-zinc-500 font-medium leading-6">Ứng dụng cần quyền Camera để quét mã QR định danh LOT. Vui lòng cấp quyền để tiếp tục.</Text>
                <TouchableOpacity onPress={requestPermission} className="bg-zinc-900 w-full py-4 rounded-3xl mt-10 shadow-xl active:scale-95">
                    <Text className="text-white text-center font-black text-lg">CẤP QUYỀN CAMERA</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-zinc-50">
            {/* Super Premium Header */}
            <View className="bg-white pt-12 pb-4 px-6 border-b border-zinc-100 flex-row justify-between items-center shadow-sm z-20">
                <View>
                    <Text className="text-[10px] font-black text-blue-600 uppercase tracking-[2px]">SARITA WORKSPACE</Text>
                    <Text className="font-black text-2xl text-zinc-900 tracking-tight">Xuất Kho</Text>
                    <Text className="text-[10px] font-medium text-zinc-400 mt-0.5">
                        Cập nhật: {lastUpdated || 'Chưa đồng bộ'}
                    </Text>
                </View>
                <View className="flex-row gap-2">
                    <TouchableOpacity
                        onPress={syncAllData}
                        disabled={isDownloadingGlobal}
                        className="bg-blue-600 w-10 h-10 items-center justify-center rounded-xl shadow-sm shadow-blue-200"
                    >
                        {isDownloadingGlobal ? (
                            <ActivityIndicator size="small" color="white" />
                        ) : (
                            <Feather name="download-cloud" size={18} color="white" />
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setShowScanner(true)}
                        className="overflow-hidden rounded-xl shadow-lg shadow-emerald-500/30"
                    >
                        <LinearGradient
                            colors={['#059669', '#10b981']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', gap: 8, alignItems: 'center', height: 40 }}
                        >
                            <MaterialCommunityIcons name="qrcode-scan" size={18} color="white" />
                            <Text className="text-white font-black text-xs">QUÉT</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
                {!lotCode ? (
                    <View className="px-6 pt-6">
                        {/* Embedded Mini Camera (Now at context top) */}
                        <View className="h-80 w-full bg-black relative rounded-xl overflow-hidden shadow-sm border-4 border-white">
                            {isCameraActive ? (
                                <CameraView
                                    style={StyleSheet.absoluteFillObject}
                                    facing="back"
                                    onBarcodeScanned={handleScan}
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

                            <TouchableOpacity
                                onPress={() => setIsCameraActive(!isCameraActive)}
                                className="absolute bottom-2 left-2 p-2 bg-black/40 rounded-full"
                            >
                                <Feather name={isCameraActive ? "pause" : "play"} size={16} color="white" />
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setShowScanner(true)}
                                className="absolute top-2 right-2 p-2 bg-black/40 rounded-full"
                            >
                                <Feather name="maximize-2" size={20} color="white" />
                            </TouchableOpacity>
                        </View>

                        <View className="items-center justify-center py-10">
                            <View className="w-24 h-24 bg-zinc-100 rounded-full items-center justify-center mb-6">
                                <Feather name="package" size={40} color="#a1a1aa" />
                            </View>
                            <Text className="text-zinc-500 font-bold text-lg text-center">Chưa có LOT nào được chọn</Text>
                            <Text className="text-zinc-400 text-center mt-2 px-10">
                                Hãy quét mã QR định danh LOT bằng camera phía trên hoặc nút ở góc phải.
                            </Text>
                        </View>
                    </View>
                ) : (
                    <View className="space-y-6 px-6 pt-6">
                        {/* LOT Digital Tag Card */}
                        <View className="overflow-hidden rounded-[32px] bg-white border border-zinc-100 shadow-2xl shadow-zinc-200">
                            <LinearGradient
                                colors={['#18181b', '#3f3f46']}
                                style={{ padding: 24, paddingBottom: 48 }}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <View className="flex-row justify-between items-center mb-4">
                                    <View className="bg-emerald-500 px-3 py-1 rounded-full">
                                        <Text className="text-white text-[10px] font-black uppercase tracking-widest">LOT ACTIVE</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => { setLotCode(null); setLines([]); setHeader(null); }}
                                        className="w-10 h-10 bg-white/10 rounded-2xl items-center justify-center border border-white/20"
                                    >
                                        <Feather name="x" size={20} color="white" />
                                    </TouchableOpacity>
                                </View>
                                <Text className="text-white/50 text-[10px] font-black uppercase tracking-[3px] mb-1">Lot Identifer</Text>
                                <Text className="text-4xl font-black text-white tracking-tighter">{lotCode}</Text>
                            </LinearGradient>

                            {/* Info Rows in White Area */}
                            <View className="bg-white -mt-8 mx-4 rounded-[24px] p-5 shadow-sm border border-zinc-50 flex-row justify-around">
                                <View className="items-center">
                                    <Text className="text-[9px] font-black text-zinc-400 uppercase tracking-wider mb-1">Ngày Gọt</Text>
                                    <Text className="text-sm font-black text-zinc-900">{header?.peelDate || '--'}</Text>
                                </View>
                                <View className="w-[1px] h-8 bg-zinc-100 self-center" />
                                <View className="items-center">
                                    <Text className="text-[9px] font-black text-zinc-400 uppercase tracking-wider mb-1">Ngày Đóng</Text>
                                    <Text className="text-sm font-black text-zinc-900">{header?.packDate || '--'}</Text>
                                </View>
                                <View className="w-[1px] h-8 bg-zinc-100 self-center" />
                                <View className="items-center">
                                    <Text className="text-[9px] font-black text-zinc-400 uppercase tracking-wider mb-1">QC Pass</Text>
                                    <Text className="text-sm font-black text-emerald-600">{header?.qc || 'OK'}</Text>
                                </View>
                            </View>

                            <View className="p-6 pt-4">
                                <View className="flex-row gap-2 mb-4">
                                    <TouchableOpacity
                                        onPress={() => setMode('FULL')}
                                        className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border ${mode === 'FULL' ? 'bg-zinc-900 border-zinc-900' : 'bg-transparent border-zinc-200'}`}
                                    >
                                        <MaterialCommunityIcons name="select-all" size={18} color={mode === 'FULL' ? 'white' : '#71717a'} />
                                        <Text className={`font-black text-xs ${mode === 'FULL' ? 'text-white' : 'text-zinc-500'}`}>XUẤT HẾT</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setMode('PARTIAL')}
                                        className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border ${mode === 'PARTIAL' ? 'bg-amber-500 border-amber-500 shadow-lg shadow-amber-500/30' : 'bg-transparent border-zinc-200'}`}
                                    >
                                        <MaterialCommunityIcons name="numeric" size={18} color={mode === 'PARTIAL' ? 'white' : '#71717a'} />
                                        <Text className={`font-black text-xs ${mode === 'PARTIAL' ? 'text-white' : 'text-zinc-500'}`}>TỪNG PHẦN</Text>
                                    </TouchableOpacity>
                                </View>

                                <View className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100">
                                    <View className="flex-row items-center gap-2 mb-2">
                                        <Feather name="edit-3" size={14} color="#71717a" />
                                        <Text className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Lý do xuất kho</Text>
                                    </View>
                                    <TextInput
                                        placeholder="Ghi chú lý do xuất hàng..."
                                        value={reason}
                                        onChangeText={setReason}
                                        className="font-bold text-zinc-900 text-sm p-0"
                                        multiline
                                    />
                                </View>
                            </View>
                        </View>

                        {/* Inventory List Section */}
                        <View className="space-y-3">
                            <View className="flex-row justify-between items-center px-2">
                                <Text className="font-black text-zinc-400 text-[10px] uppercase tracking-widest">Danh sách sản phẩm</Text>
                                <Text className="text-zinc-400 font-bold text-[10px]">{lines.length} mặt hàng</Text>
                            </View>

                            {lines.map((item, index) => (
                                <View key={index} className="bg-white p-4 rounded-[28px] border border-zinc-100 shadow-xl shadow-zinc-200/50 flex-row gap-4 items-center relative overflow-hidden">
                                    {/* Background Decor */}
                                    <View className="absolute top-0 right-0 w-24 h-24 bg-zinc-50 rounded-full -mr-12 -mt-12 opacity-50" />

                                    <View className="w-20 h-20 rounded-3xl bg-zinc-50 items-center justify-center border border-zinc-100">
                                        {item.imageUrl ? (
                                            <Image source={{ uri: item.imageUrl }} className="w-full h-full rounded-3xl" />
                                        ) : (
                                            <Feather name="image" size={28} color="#d4d4d8" />
                                        )}
                                    </View>

                                    <View className="flex-1">
                                        <Text className="font-black text-zinc-900 text-lg leading-6" numberOfLines={1}>{item.productName}</Text>
                                        <View className="flex-row items-center gap-2 mt-0.5">
                                            <Text className="text-[9px] font-black text-zinc-400 uppercase tracking-wider">{item.productCode}</Text>
                                            <View className="w-1 h-1 bg-zinc-300 rounded-full" />
                                            <Text className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">{item.unit}</Text>
                                        </View>

                                        <View className="flex-row items-center justify-between mt-3">
                                            <View className="flex-row items-center bg-zinc-50 px-3 py-1.5 rounded-full">
                                                <Text className="text-[10px] font-black text-zinc-400 mr-2">TỒN:</Text>
                                                <Text className="font-black text-zinc-800 text-sm">{item.quantity}</Text>
                                            </View>

                                            {mode === 'PARTIAL' ? (
                                                <View className="flex-row items-center bg-amber-50 px-3 py-1 rounded-2xl border border-amber-100">
                                                    <Text className="text-[9px] font-black text-amber-600 mr-2">XUẤT:</Text>
                                                    <TextInput
                                                        value={item.exportQty}
                                                        onChangeText={(t) => updateLineQty(index, t)}
                                                        keyboardType="numeric"
                                                        className="font-black text-amber-700 w-12 py-1 text-center"
                                                        selectTextOnFocus
                                                    />
                                                </View>
                                            ) : (
                                                <View className="flex-row items-center bg-emerald-50 px-3 py-1 rounded-2xl">
                                                    <Feather name="check" size={12} color="#059669" className="mr-1" />
                                                    <Text className="text-[10px] font-black text-emerald-600">FULL</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
                <AppFooter />
            </ScrollView>

            {/* Float Confirm Button */}
            {lotCode && (
                <View className="absolute bottom-10 left-6 right-6 z-30">
                    <TouchableOpacity
                        onPress={handleExport}
                        disabled={isExporting}
                        className="overflow-hidden rounded-[32px] shadow-2xl shadow-zinc-900/30"
                    >
                        <LinearGradient
                            colors={isExporting ? ['#d4d4d8', '#a1a1aa'] : mode === 'FULL' ? ['#e11d48', '#be123c'] : ['#f59e0b', '#d97706']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{ paddingVertical: 20, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}
                        >
                            {isExporting ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <>
                                    <Feather name="upload-cloud" size={24} color="white" />
                                    <Text className="text-white font-black text-xl tracking-tight">XÁC NHẬN XUẤT KHO</Text>
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            )}

            {/* Camera Modal (Same as AssignScreen) */}
            <Modal visible={showScanner} animationType="slide" presentationStyle="fullScreen">
                <View className="flex-1 bg-black">
                    <CameraView
                        style={StyleSheet.absoluteFillObject}
                        facing="back"
                        onBarcodeScanned={handleScan}
                    />
                    <View className="flex-1 justify-between p-10">
                        <TouchableOpacity onPress={() => setShowScanner(false)} className="self-end bg-black/50 p-2 rounded-full">
                            <Feather name="x" size={24} color="white" />
                        </TouchableOpacity>
                        <View className="self-center w-64 h-64 border-2 border-emerald-500 rounded-lg opacity-50" />
                        <Text className="text-white text-center bg-black/50 py-2 rounded-full font-bold">Quét mã sản phẩm hoặc LOT</Text>
                    </View>
                </View>
            </Modal>

            {/* Loading Overlay */}
            {loading && (
                <View className="absolute inset-0 bg-white/60 justify-center items-center z-50">
                    <ActivityIndicator size="large" color="#059669" />
                    <Text className="mt-4 text-emerald-700 font-bold">Đang tải dữ liệu LOT...</Text>
                </View>
            )}

            {/* Toast Notification */}
            {toast.visible && (
                <View className={`absolute bottom-10 left-4 right-4 p-4 rounded-2xl shadow-xl flex-row items-center gap-3 z-50 ${toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-rose-600' : 'bg-slate-700'}`}>
                    <Feather name={toast.type === 'success' ? 'check-circle' : 'info'} size={24} color="white" />
                    <Text className="text-white font-bold flex-1">{toast.message}</Text>
                </View>
            )}
        </View>
    );
}
