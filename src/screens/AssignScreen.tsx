import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, Vibration, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import client from '../api/client';
import { Dropdown } from '../components/Dropdown';
import { LinearGradient } from 'expo-linear-gradient';

interface ScannedItem {
    id: string;
    timestamp: number;
    position: string;
    synced: boolean;
    quantity: number;
}

import { Accelerometer } from 'expo-sensors';

export default function AssignScreen() {
    const [items, setItems] = useState<ScannedItem[]>([]);
    const [showScanner, setShowScanner] = useState(false);
    const [showFullAlert, setShowFullAlert] = useState(false);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'error' }>({ visible: false, message: '', type: 'success' });
    const toastTimer = useRef<NodeJS.Timeout | null>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const [locations, setLocations] = useState<string[]>([]);
    const [occupied, setOccupied] = useState<Record<string, string>>({});
    const [suggestions, setSuggestions] = useState<Array<{ code: string; lotCode?: string }>>([]);
    const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const isProcessing = useRef(false);

    const [isCameraActive, setIsCameraActive] = useState(true);

    // Smart Input & Shake
    const inputRef = useRef<TextInput>(null);
    const [subscription, setSubscription] = useState<any>(null);

    // Location Settings
    const [workWarehouse, setWorkWarehouse] = useState<number>(1);
    const [workZone, setWorkZone] = useState<string>('A');
    const [workRow, setWorkRow] = useState<number | null>(null);
    const [workLevel, setWorkLevel] = useState<number | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [smartInput, setSmartInput] = useState('');

    useEffect(() => {
        loadOfflineData();
        loadSettings();
        _subscribe();
        return () => _unsubscribe();
    }, []);

    const _subscribe = () => {
        setSubscription(
            Accelerometer.addListener(accelerometerData => {
                const { x, y, z } = accelerometerData;
                const acceleration = Math.sqrt(x * x + y * y + z * z);
                // Threshold for shake
                if (acceleration > 2.5) {
                    handleShakeDetected();
                }
            })
        );
        Accelerometer.setUpdateInterval(500); // Check every 500ms
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

    useEffect(() => { saveItems(); }, [items]);
    useEffect(() => {
        if (workZone === 'S') { setWorkRow(null); setWorkLevel(null); }
    }, [workZone]);
    useEffect(() => { saveSettings(); }, [workWarehouse, workZone, workRow, workLevel]);

    const loadSettings = async () => {
        try {
            const v = await AsyncStorage.getItem('assign_settings');
            if (v) {
                const p = JSON.parse(v);
                if (p.warehouse) setWorkWarehouse(p.warehouse);
                if (p.zone) setWorkZone(p.zone);
                setWorkRow(p.row ?? null);
                setWorkLevel(p.level ?? null);
            }
        } catch (e) { console.error("Failed to load settings", e); }
    };

    const saveSettings = async () => {
        try {
            await AsyncStorage.setItem('assign_settings', JSON.stringify({
                warehouse: workWarehouse, zone: workZone, row: workRow, level: workLevel
            }));
        } catch (e) { console.error("Failed to save settings", e); }
    };

    const loadOfflineData = async () => {
        try {
            const savedItems = await AsyncStorage.getItem('assign_items');
            if (savedItems) setItems(JSON.parse(savedItems));
            const savedLocs = await AsyncStorage.getItem('offline_static_locations');
            if (savedLocs) { const parsed = JSON.parse(savedLocs); if (Array.isArray(parsed)) setLocations(parsed); }
            const savedOcc = await AsyncStorage.getItem('offline_occupied_locations');
            if (savedOcc) { const parsed = JSON.parse(savedOcc); if (parsed && typeof parsed === 'object') setOccupied(parsed); }
        } catch (e) { console.error(e); }
    };

    const saveItems = async () => {
        await AsyncStorage.setItem('assign_items', JSON.stringify(items));
    };

    const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ visible: true, message, type });
        toastTimer.current = setTimeout(() => { setToast(prev => ({ ...prev, visible: false })); }, 3000);
    };

    const effectiveOccupied = React.useMemo(() => {
        const temp = { ...occupied };
        items.forEach(i => {
            if (i.position) { temp[i.position] = i.id; temp[i.position.toUpperCase()] = i.id; }
        });
        return temp;
    }, [occupied, items]);

    const findNextAvailablePosition = (warehouse: number, zone: string, row: number | null, level: number | null): string => {
        if (!row || !level) return '';
        for (let i = 1; i <= 8; i++) {
            const suffix = `PL${i}`;
            const candidate = locations.find(loc => {
                const upper = loc.toUpperCase();
                if (!upper.endsWith(suffix)) return false;
                const parts = upper.split(/[-.]/);
                const checkToken = (prefix: string, val: number) => {
                    const token = `${prefix}${val}`;
                    return parts.some(p => p.includes(token));
                };
                const hasWarehouse = checkToken('W', warehouse) || checkToken('K', warehouse) || parts.some(p => p === warehouse.toString());
                const hasZone = parts.includes(zone);
                const hasRow = checkToken('D', row) || checkToken('R', row) || parts.some(p => parseInt(p) === row);
                const hasLevel = checkToken('T', level) || checkToken('L', level) || parts.some(p => p === level.toString());
                return hasWarehouse && hasZone && hasRow && hasLevel;
            });
            if (candidate) {
                const isOccupied = effectiveOccupied[candidate] || effectiveOccupied[candidate.toUpperCase()];
                if (!isOccupied) return candidate;
            }
        }
        return '';
    };

    const handleScan = ({ data }: { data: string }) => {
        if (isProcessing.current) return;
        isProcessing.current = true;
        Vibration.vibrate();

        let code = data.trim();
        if (code.includes('/qr/')) {
            try {
                const url = new URL(code);
                const pathParts = url.pathname.split('/');
                const qrIndex = pathParts.indexOf('qr');
                if (qrIndex !== -1 && pathParts[qrIndex + 1]) { code = decodeURIComponent(pathParts[qrIndex + 1]); }
            } catch (e) { }
        }

        setItems(prev => {
            const existingIdx = prev.findIndex(i => i.id === code);
            let position = '';
            if (existingIdx !== -1) {
                position = prev[existingIdx].position;
            } else {
                position = findNextAvailablePosition(workWarehouse, workZone, workRow, workLevel);
                if (!position && workRow && workLevel) { setShowFullAlert(true); }
                else if (position) { showToast(`Đã gán: ${position}`, 'success'); }
                else { showToast(`Đã quét: ${code}`, 'info'); }
            }
            const newItem: ScannedItem = { id: code, timestamp: Date.now(), position, synced: false, quantity: 1 };
            if (existingIdx !== -1) {
                const newArr = [...prev];
                newArr.splice(existingIdx, 1);
                return [newItem, ...newArr];
            }
            return [newItem, ...prev];
        });
        setShowScanner(false);
        setTimeout(() => { isProcessing.current = false; }, 1000);
    };

    const handleUpdatePosition = (index: number, text: string) => {
        const newItems = [...items];
        newItems[index].position = text;
        newItems[index].synced = false;
        setItems(newItems);

        if (text.trim().length > 0 && locations.length > 0) {
            const q = text.toUpperCase();
            const normalize = (str: string) => str.replace(/[.\-]/g, "");
            const qNormalized = normalize(q);
            const matches: Array<{ code: string; score: number; lotCode?: string }> = [];

            for (const code of locations) {
                const codeUpper = code.toUpperCase();
                const codeNormalized = normalize(codeUpper);
                let score = 0;
                if (codeNormalized === qNormalized) score = 1000;
                else if (codeUpper === q) score = 950;
                else if (codeNormalized.startsWith(qNormalized)) score = 900;
                else if (codeUpper.startsWith(q)) score = 850;
                else if (codeNormalized.includes(qNormalized)) score = 700;
                else if (codeUpper.includes(q)) score = 650;
                else {
                    const parts = codeUpper.split(/[-.]/).filter(Boolean);
                    if (parts.some((p) => p.startsWith(q))) score = 500;
                    else if (parts.some((p) => p.includes(q))) score = 300;
                }
                if (score > 0) {
                    matches.push({ code, score, lotCode: effectiveOccupied[code] || effectiveOccupied[codeUpper] });
                }
            }
            matches.sort((a, b) => b.score - a.score);
            setSuggestions(matches.slice(0, 5).map(m => ({ code: m.code, lotCode: m.lotCode })));
            setActiveInputIndex(index);
        } else {
            setSuggestions([]);
            if (text.trim().length > 0) setActiveInputIndex(index);
            else setActiveInputIndex(null);
        }
    };

    const handleSelectSuggestion = (index: number, loc: string) => {
        const newItems = [...items];
        newItems[index].position = loc;
        setItems(newItems);
        setSuggestions([]);
        setActiveInputIndex(null);
    };

    const handleRemoveItem = (index: number) => {
        Alert.alert("Xóa mục", "Bạn có chắc muốn xóa mục này?", [
            { text: "Hủy", style: "cancel" },
            { text: "Xóa", style: "destructive", onPress: () => { const newItems = [...items]; newItems.splice(index, 1); setItems(newItems); } }
        ]);
    };

    const handleClearSynced = () => { setItems(prev => prev.filter(i => !i.synced)); };

    const handleSync = async () => {
        const pending = items.filter(i => !i.synced && i.position.trim());
        if (pending.length === 0) { Alert.alert("Thông báo", "Không có mục nào cần đồng bộ."); return; }

        setIsSyncing(true);
        try {
            const payload = { items: pending.map(i => ({ code: i.id, position: i.position, quantity: i.quantity, timestamp: i.timestamp })) };
            const res = await client.post('/scan/sync', payload);
            if (res.data.ok) {
                const syncedIds = new Set(pending.map(i => i.id));
                setItems(prev => prev.map(i => syncedIds.has(i.id) ? { ...i, synced: true } : i));
                const newOccupied = { ...occupied };
                pending.forEach(i => { if (i.position) { newOccupied[i.position] = i.id; newOccupied[i.position.toUpperCase()] = i.id; } });
                setOccupied(newOccupied);
                await AsyncStorage.setItem('offline_occupied_locations', JSON.stringify(newOccupied));
                Alert.alert("Thành công", `Đã đồng bộ ${pending.length} mục!`);
            } else { Alert.alert("Lỗi", res.data.message || "Sync thất bại"); }
        } catch (e: any) {
            console.error(e);
            let msg = e.message;
            if (e.response?.data) { msg = e.response.data.message || msg; }
            Alert.alert("Lỗi kết nối", msg);
        } finally { setIsSyncing(false); }
    };

    const handleSmartInput = (text: string) => {
        setSmartInput(text);

        // Helper: Convert Vietnamese number words to digits
        const normalizeText = (str: string) => {
            let s = str.toLowerCase();
            const map: Record<string, string> = {
                'một': '1', 'hai': '2', 'ba': '3', 'bốn': '4', 'năm': '5', 'lăm': '5',
                'sáu': '6', 'bảy': '7', 'tám': '8', 'chín': '9', 'mười': '10'
            };
            Object.keys(map).forEach(key => {
                s = s.replace(new RegExp(key, 'g'), map[key]);
            });
            // Compact pattern: AK3D4 -> A K3 D4 (insert spaces to help parsing if needed, but regex handles it)
            return s;
        };

        const lower = normalizeText(text);

        // 1. Try to parse compact code first: e.g., "AK3D4" or "A K3 D4" or "AK3D4T1"
        // Pattern: [Zone][K][Warehouse][D][Row]([T][Level])?
        const compactMatch = lower.match(/([a-z])\s*k(\d+)\s*d(\d+)(?:\s*t(\d+))?/i);
        if (compactMatch) {
            const z = compactMatch[1].toUpperCase();
            const w = parseInt(compactMatch[2]);
            const r = parseInt(compactMatch[3]);
            const l = compactMatch[4] ? parseInt(compactMatch[4]) : null;

            if (['A', 'B', 'S'].includes(z)) setWorkZone(z);
            if ([1, 2, 3].includes(w)) setWorkWarehouse(w);
            setWorkRow(r);
            if (l !== null) setWorkLevel(l);
        }

        // 2. Fallback / Additional Parsing (e.g. "Tầng X" or standard "Kho X")

        // Parse Warehouse (Kho 1, Kho 2...) - Flexible: kho, ko, khô
        // Only run if not already set by compact match (or allows override)
        if (!compactMatch) {
            const warehouseMatch = lower.match(/(?:kho|khô|ko)\s*(\d+)/);
            if (warehouseMatch && warehouseMatch[1]) {
                const w = parseInt(warehouseMatch[1]);
                if ([1, 2, 3].includes(w)) setWorkWarehouse(w);
            }

            // Parse Zone (Khu A, Khu B, Sảnh) - Flexible: khu, ku
            const zoneMatch = lower.match(/(?:khu|ku)\s*([a-zs])/);
            if (zoneMatch && zoneMatch[1]) {
                const z = zoneMatch[1].toUpperCase();
                if (['A', 'B', 'S'].includes(z)) setWorkZone(z);
            } else if (lower.includes('sảnh')) {
                setWorkZone('S');
            }

            // Parse Row (Dãy 1, Dãy 2...) - Flexible: dãy, day, dạy, dai
            const rowMatch = lower.match(/(?:dãy|day|dạy|dai)\s*(\d+)/);
            if (rowMatch && rowMatch[1]) {
                const r = parseInt(rowMatch[1]);
                setWorkRow(r);
            }
        }

        // Parse Level (Tầng 1, Tầng 2...) - Flexible: tầng, tang, tan
        // Always check for level as it's often separate (e.g. "AK3D4 Tầng 2")
        const levelMatch = lower.match(/(?:tầng|tang|tan|tần)\s*(\d+)/);
        if (levelMatch && levelMatch[1]) {
            const l = parseInt(levelMatch[1]);
            setWorkLevel(l);
        }
    };

    const pendingCount = items.filter(i => !i.synced && i.position.trim()).length;
    const syncedCount = items.filter(i => i.synced).length;

    if (!permission) return <View className="flex-1 bg-zinc-50" />;
    if (!permission.granted) {
        return (
            <View className="flex-1 bg-zinc-50 justify-center items-center p-6">
                <View className="w-24 h-24 bg-blue-100 rounded-full items-center justify-center mb-6">
                    <Feather name="camera-off" size={40} color="#2563eb" />
                </View>
                <Text className="text-zinc-900 font-black text-xl text-center mb-2">Cần quyền Camera</Text>
                <Text className="text-zinc-500 text-center mb-6">Ứng dụng cần quyền truy cập camera để quét mã QR</Text>
                <TouchableOpacity onPress={requestPermission} className="bg-blue-600 px-6 py-3 rounded-2xl">
                    <Text className="text-white font-black">Cấp quyền</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-zinc-50">
            {/* Premium Header */}
            <View className="bg-white pt-14 pb-4 px-6 border-b border-zinc-100 shadow-sm z-20">
                <Text className="text-[10px] font-black text-blue-600 uppercase tracking-[2px]">SARITA • SCAN</Text>
                <View className="flex-row justify-between items-end mt-1">
                    <View>
                        <Text className="font-black text-3xl text-zinc-900 tracking-tighter">Gán Vị Trí</Text>
                        {items.length > 0 && (
                            <Text className="text-zinc-400 text-[10px] font-medium mt-1">
                                {pendingCount} chờ sync • {syncedCount} đã sync
                            </Text>
                        )}
                    </View>
                    <View className="flex-row gap-2">
                        {/* Settings Button */}
                        <TouchableOpacity
                            onPress={() => setShowSettings(true)}
                            className="bg-zinc-100 p-2.5 rounded-xl"
                        >
                            <Feather name="sliders" size={18} color="#71717a" />
                        </TouchableOpacity>

                        {/* Clear Synced Button */}
                        {syncedCount > 0 && (
                            <TouchableOpacity
                                onPress={handleClearSynced}
                                className="bg-zinc-100 p-2.5 rounded-xl"
                            >
                                <Feather name="trash-2" size={18} color="#71717a" />
                            </TouchableOpacity>
                        )}

                        {/* Sync Button */}
                        <TouchableOpacity
                            onPress={handleSync}
                            disabled={isSyncing || pendingCount === 0}
                            className={`px-4 py-2.5 rounded-xl flex-row items-center gap-2 ${pendingCount > 0 ? 'bg-emerald-500' : 'bg-zinc-100'}`}
                        >
                            {isSyncing ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <Feather name="upload-cloud" size={18} color={pendingCount > 0 ? "white" : "#a1a1aa"} />
                            )}
                            <Text className={`font-black text-xs ${pendingCount > 0 ? 'text-white' : 'text-zinc-400'}`}>
                                {pendingCount > 0 ? pendingCount : 'Sync'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
                <View className="px-6 pt-6">
                    {/* Camera Box - Premium Style */}
                    <View className="h-72 w-full bg-black relative rounded-xl overflow-hidden shadow-lg border-4 border-white mb-6">
                        {isCameraActive ? (
                            <CameraView
                                style={StyleSheet.absoluteFillObject}
                                facing="back"
                                onBarcodeScanned={handleScan}
                                barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128'] }}
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
                            onPress={() => setShowScanner(true)}
                            className="absolute top-2 right-2 p-2 bg-black/40 rounded-full"
                        >
                            <Feather name="maximize-2" size={20} color="white" />
                        </TouchableOpacity>
                        {/* Location Badge */}
                        <View className="absolute top-2 left-2 bg-black/60 px-3 py-1.5 rounded-xl flex-row items-center gap-2">
                            <Feather name="map-pin" size={12} color={isCameraActive ? "#34d399" : "#71717a"} />
                            <Text className="text-white text-[10px] font-black">
                                K{workWarehouse} • {workZone}{workRow ? `-${workRow}` : ''}{workLevel ? `-T${workLevel}` : ''}
                            </Text>
                        </View>

                        {/* Toggle Button Overlay */}
                        <TouchableOpacity
                            onPress={() => setIsCameraActive(!isCameraActive)}
                            className="absolute bottom-2 left-2 p-2 bg-black/40 rounded-full"
                        >
                            <Feather name={isCameraActive ? "pause" : "play"} size={16} color="white" />
                        </TouchableOpacity>
                    </View>

                    {/* Items List */}
                    {items.length === 0 ? (
                        <View className="items-center justify-center py-16">
                            <View className="w-24 h-24 bg-zinc-100 rounded-full items-center justify-center mb-6">
                                <Feather name="package" size={40} color="#a1a1aa" />
                            </View>
                            <Text className="text-zinc-500 font-bold text-lg text-center">Chưa có mã nào</Text>
                            <Text className="text-zinc-400 text-center mt-2 px-10 text-xs font-medium leading-5">
                                Quét mã QR sản phẩm hoặc LOT để bắt đầu gán vị trí
                            </Text>
                        </View>
                    ) : (
                        <View>
                            <View className="flex-row justify-between items-center mb-4 px-1">
                                <Text className="font-black text-zinc-400 text-[10px] uppercase tracking-widest">Danh sách ({items.length})</Text>
                            </View>

                            {items.map((item, index) => (
                                <View
                                    key={item.timestamp}
                                    className={`mb-3 p-4 rounded-[24px] border shadow-sm ${item.synced ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-zinc-100'}`}
                                >
                                    <View className="flex-row items-start justify-between">
                                        <View className="flex-1">
                                            <View className="flex-row items-center gap-2 mb-1">
                                                <Text className="font-black text-base text-zinc-900">{item.id}</Text>
                                                {item.synced && (
                                                    <View className="bg-emerald-500 rounded-full p-0.5">
                                                        <Feather name="check" size={10} color="white" />
                                                    </View>
                                                )}
                                            </View>
                                            <Text className="text-[10px] text-zinc-400 font-medium mb-3">
                                                {new Date(item.timestamp).toLocaleTimeString('vi-VN')}
                                            </Text>

                                            {/* Position Input */}
                                            <View className="relative z-10">
                                                <TextInput
                                                    placeholder="Nhập vị trí..."
                                                    value={item.position}
                                                    onChangeText={(t) => handleUpdatePosition(index, t)}
                                                    onFocus={() => handleUpdatePosition(index, item.position)}
                                                    editable={!item.synced}
                                                    className={`border rounded-xl px-4 py-3 font-bold ${item.synced
                                                        ? 'bg-emerald-100/50 text-emerald-700 border-emerald-200'
                                                        : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                                                        }`}
                                                />
                                                {/* Suggestions */}
                                                {activeInputIndex === index && (
                                                    <View className="absolute top-full left-0 right-0 bg-white border border-zinc-200 rounded-xl shadow-xl mt-1 z-50 overflow-hidden">
                                                        {locations.length === 0 ? (
                                                            <View className="p-4">
                                                                <Text className="text-zinc-400 text-xs text-center">Chưa có dữ liệu vị trí.{'\n'}Vào Cài Đặt để tải về.</Text>
                                                            </View>
                                                        ) : suggestions.length > 0 ? (
                                                            suggestions.map((s) => (
                                                                <TouchableOpacity
                                                                    key={s.code}
                                                                    onPress={() => handleSelectSuggestion(index, s.code)}
                                                                    className="p-3 border-b border-zinc-100 flex-row justify-between items-center"
                                                                >
                                                                    <Text className="font-bold text-zinc-700">{s.code}</Text>
                                                                    {s.lotCode && <Text className="text-[10px] text-rose-500 font-medium">Có: {s.lotCode}</Text>}
                                                                </TouchableOpacity>
                                                            ))
                                                        ) : (
                                                            <View className="p-4">
                                                                <Text className="text-zinc-400 text-xs text-center">Không tìm thấy</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                        </View>

                                        {/* Delete Button */}
                                        {!item.synced && (
                                            <TouchableOpacity
                                                onPress={() => handleRemoveItem(index)}
                                                className="ml-3 p-2"
                                            >
                                                <Feather name="x" size={18} color="#e11d48" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Settings Modal */}
            <Modal visible={showSettings} transparent animationType="fade">
                <View className="flex-1 bg-black/60 justify-center px-6">
                    <View className="bg-white rounded-[32px] p-6 shadow-2xl">
                        <View className="items-center mb-6">
                            <View className="w-14 h-14 bg-blue-50 rounded-2xl items-center justify-center mb-3">
                                <Feather name="map-pin" size={28} color="#2563eb" />
                            </View>
                            <Text className="text-xl font-black text-zinc-900">Vị trí làm việc</Text>
                        </View>

                        <View className="gap-4 mb-6">
                            {/* Smart Voice Input - Compact Design */}
                            <View>
                                <Text className="text-zinc-500 text-xs font-bold mb-1.5 ml-1 uppercase tracking-wider">Nhập nhanh / Giọng nói</Text>
                                <View className="flex-row items-center border border-zinc-200 rounded-2xl px-3 bg-zinc-50 focus:border-blue-500 focus:bg-white transition-colors h-12">
                                    <View className="mr-2">
                                        <Feather name="mic" size={18} color="#2563eb" />
                                    </View>
                                    <TextInput
                                        ref={inputRef}
                                        placeholder="VD: Kho 1 Khu A Dãy 2..."
                                        value={smartInput}
                                        onChangeText={handleSmartInput}
                                        className="flex-1 font-medium text-zinc-900 text-base h-full"
                                        placeholderTextColor="#a1a1aa"
                                    />
                                    {smartInput.length > 0 && (
                                        <TouchableOpacity onPress={() => setSmartInput('')} className="p-1 bg-zinc-200 rounded-full">
                                            <Feather name="x" size={12} color="#71717a" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <Text className="text-[10px] text-zinc-400 mt-1.5 ml-1">
                                    Nhấn mic trên bàn phím để nói.
                                </Text>
                            </View>
                        </View>

                        <View className="h-[1px] bg-zinc-100 my-2" />

                        <Dropdown
                            label="Kho"
                            value={workWarehouse}
                            options={[
                                { label: 'Kho 1', value: 1 },
                                { label: 'Kho 2', value: 2 },
                                { label: 'Kho 3', value: 3 },
                            ]}
                            onSelect={(v) => setWorkWarehouse(v)}
                        />
                        <Dropdown
                            label="Khu"
                            value={workZone}
                            options={[
                                { label: 'Khu A', value: 'A' },
                                { label: 'Khu B', value: 'B' },
                                { label: 'Sảnh', value: 'S' },
                            ]}
                            onSelect={(v) => setWorkZone(v)}
                        />
                        {
                            workZone !== 'S' && (
                                <Dropdown
                                    label="Dãy"
                                    value={workRow}
                                    placeholder="Chọn..."
                                    options={(() => {
                                        const maxRows = workZone === 'A' ? 7 : (workWarehouse === 1 ? 6 : 7);
                                        return Array.from({ length: maxRows }, (_, i) => ({ label: `${i + 1}`, value: i + 1 }));
                                    })()}
                                    onSelect={(v) => setWorkRow(v)}
                                    onClear={() => setWorkRow(null)}
                                />
                            )
                        }
                        {
                            workZone !== 'S' && (
                                <Dropdown
                                    label="Tầng"
                                    value={workLevel}
                                    placeholder="Chọn..."
                                    options={(() => {
                                        const maxLevels = workZone === 'A' ? 5 : 4;
                                        return Array.from({ length: maxLevels }, (_, i) => ({ label: `${i + 1}`, value: i + 1 }));
                                    })()}
                                    onSelect={(v) => setWorkLevel(v)}
                                    onClear={() => setWorkLevel(null)}
                                />
                            )
                        }
                    </View>


                    <TouchableOpacity
                        onPress={() => setShowSettings(false)}
                        className="w-full bg-zinc-900 py-4 rounded-2xl items-center"
                    >
                        <Text className="text-white font-black">Đóng</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* Fullscreen Camera Modal */}
            <Modal visible={showScanner} animationType="slide" presentationStyle="fullScreen">
                <View className="flex-1 bg-black">
                    <CameraView
                        style={StyleSheet.absoluteFillObject}
                        facing="back"
                        onBarcodeScanned={handleScan}
                        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128'] }}
                    />
                    <View className="flex-1 justify-between p-8 pt-16">
                        <TouchableOpacity onPress={() => setShowScanner(false)} className="self-end bg-black/50 p-3 rounded-full">
                            <Feather name="x" size={24} color="white" />
                        </TouchableOpacity>
                        <View className="self-center w-64 h-64 border-2 border-white/30 rounded-3xl" />
                        <View className="bg-black/60 py-3 px-6 rounded-2xl self-center">
                            <Text className="text-white text-center font-bold">Quét mã sản phẩm hoặc LOT</Text>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Full Alert Modal */}
            <Modal visible={showFullAlert} transparent animationType="fade">
                <View className="flex-1 bg-black/60 justify-center px-6">
                    <View className="bg-white rounded-[32px] p-6 shadow-2xl">
                        <View className="items-center mb-6">
                            <View className="w-14 h-14 bg-rose-50 rounded-2xl items-center justify-center mb-3">
                                <Feather name="alert-triangle" size={28} color="#ef4444" />
                            </View>
                            <Text className="text-xl font-black text-zinc-900 text-center">Vị trí làm việc chưa đầy đủ</Text>
                            <Text className="text-zinc-500 text-center mt-2">
                                Vui lòng chọn đầy đủ thông tin vị trí làm việc để tiếp tục.
                            </Text>
                        </View>

                        <View className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 w-full mb-6">
                            <View className="flex-row justify-between py-2 border-b border-zinc-200">
                                <Text className="text-zinc-500">Kho</Text>
                                <Text className="font-black text-zinc-800">Kho {workWarehouse}</Text>
                            </View>
                            <View className="flex-row justify-between py-2 border-b border-zinc-200">
                                <Text className="text-zinc-500">Khu</Text>
                                <Text className="font-black text-zinc-800">Khu {workZone}</Text>
                            </View>
                            <View className="flex-row justify-between py-2 border-b border-zinc-200">
                                <Text className="text-zinc-500">Dãy</Text>
                                <Text className="font-black text-zinc-800">{workRow}</Text>
                            </View>
                            <View className="flex-row justify-between py-2">
                                <Text className="text-zinc-500">Tầng</Text>
                                <Text className="font-black text-zinc-800">{workLevel}</Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            onPress={() => setShowFullAlert(false)}
                            className="w-full bg-zinc-900 py-4 rounded-2xl items-center"
                        >
                            <Text className="text-white font-black">Đã hiểu</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Toast Notification */}
            {toast.visible && (
                <View className={`absolute bottom-10 left-6 right-6 p-4 rounded-2xl shadow-xl flex-row items-center gap-3 z-50 ${toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-rose-600' : 'bg-zinc-800'
                    }`}>
                    <Feather name={toast.type === 'success' ? 'check-circle' : 'info'} size={20} color="white" />
                    <Text className="text-white font-bold flex-1">{toast.message}</Text>
                </View>
            )}
        </View>
    );
}
