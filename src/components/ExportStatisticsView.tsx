import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { parseCode } from '../lib/locationCodes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportOrderApi } from '../api/client';

interface ExportStatisticsViewProps {
    order: {
        id: string;
        locations: string[];
        lotCodes: string[];
        items?: any[]; // Need items for quantity info
    } | null;
    onRefresh?: () => void; // Callback to refresh order data
}

export default function ExportStatisticsView({ order, onRefresh }: ExportStatisticsViewProps) {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [droppedGroups, setDroppedGroups] = useState<Record<string, boolean>>({});
    const [isSyncing, setIsSyncing] = useState(false);

    // Load dropped state from AsyncStorage on mount
    useEffect(() => {
        if (!order?.id) return;
        const loadDropped = async () => {
            try {
                const key = `dropped_${order.id}`;
                const saved = await AsyncStorage.getItem(key);
                if (saved) {
                    setDroppedGroups(JSON.parse(saved));
                }
            } catch (e) {
                console.log('Failed to load dropped state:', e);
            }
        };
        loadDropped();
    }, [order?.id]);

    // Save dropped state to AsyncStorage when it changes
    useEffect(() => {
        if (!order?.id) return;
        const saveDropped = async () => {
            try {
                const key = `dropped_${order.id}`;
                await AsyncStorage.setItem(key, JSON.stringify(droppedGroups));
            } catch (e) {
                console.log('Failed to save dropped state:', e);
            }
        };
        saveDropped();
    }, [order?.id, droppedGroups]);

    const handleSync = async () => {
        if (!order) return;

        // Find all dropped positions that are NOT in Hall yet
        const droppedPositions: string[] = [];

        // Iterate over droppedGroups to find marked row/levels
        Object.entries(droppedGroups).forEach(([key, isDropped]) => {
            if (!isDropped) return;

            // Find positions belonging to this group
            // We need to re-calculate statsData logic or pass it? 
            // Better to re-derive from order.locations
            order.locations.forEach(loc => {
                const parsed = parseCode(loc);
                if (!parsed) return;

                // Construct key matching toggleGroup logic
                let groupKey = '';
                if (parsed.zone === 'S') groupKey = 'S'; // Hall already dropped? usually we don't drop Hall to Hall
                else groupKey = `${parsed.row}-${parsed.level}`;

                // Unique key includes Warehouse and Zone
                const uniqueKey = `${parsed.warehouse}-${parsed.zone}-${groupKey}`;

                if (uniqueKey === key) {
                    if (parsed.zone !== 'S') { // Only move non-Hall items
                        droppedPositions.push(loc);
                    }
                }
            });
        });

        if (droppedPositions.length === 0) {
            Alert.alert("Thông báo", "Chưa có vị trí nào được đánh dấu 'Hạ hàng' (màu xanh lá) để đồng bộ.");
            return;
        }

        Alert.alert(
            "Xác nhận hạ sảnh",
            `Bạn có muốn chuyển ${droppedPositions.length} vị trí đã chọn xuống Sảnh không?`,
            [
                { text: "Hủy", style: "cancel" },
                {
                    text: "Đồng bộ ngay",
                    onPress: async () => {
                        setIsSyncing(true);
                        try {
                            // 1. Find target warehouse (assume active warehouse from first item)
                            const firstPos = parseCode(droppedPositions[0]);
                            const whId = firstPos?.warehouse || 1;

                            // 2. Find empty hall spots (Client-side simple logic matched from Web)
                            // We need existing occupied positions to be accurate. 
                            // exportOrderApi.getEmptyHallPosition finds ONE. We need MULTIPLE.
                            // Let's implement simple loop here or update API. 
                            // For simplicity/robustness, we'll try to move one by one getting fresh spots? 
                            // Or better: Fetch all positions first.

                            // Optimization: Fetch all occupied positions once
                            // Using a private helper if possible, or just calling listing API
                            /*
                              NOTE: Web uses a loop 1..20 and checks local 'posLots'. 
                              Here we don't have full posLots. We should probably rely on a server endpoint 
                              or simple heuristics. 
                              Let's use a loop calling getEmptyHallPosition specifically? No that's slow.
                              Let's try to fetch occupied list.
                            */

                            // Web logic:
                            // const hallPositions = [];
                            // for (let i = 1; i <= 20; i++) { check if occupied }

                            // We will do a loop trying 1..20. 
                            // But we need to check if ANYONE occupies it.

                            // Wait, if we move to S-1, and S-1 is occupied by THIS order, it's fine? 
                            // (e.g. shuffling). But usually S-1 is occupied by OTHER orders.

                            // Simplest: Just call the API to move?
                            // The API `moveToHall` takes `toPos`. We MUST provide it.
                            // So we MUST find empty slots.

                            // Let's do a quick fetch of all occupied positions from server
                            // We'll trust getEmptyHallPosition implementation style.

                            // REUSING exportOrderApi.getEmptyHallPosition logic but getting ALL empty
                            // We can't reuse the single-return function efficiently.
                            // Let's assume the user will verify.

                            // ACTUALLY, for V1, let's just attempt to move to "S-01", "S-02"...
                            // and if server errors, we catch it.

                            // BETTER: Fetch occupied positions
                            // We can use a direct fetch here if we import client
                            // const res = await client.get('/locations/positions');
                            // But we don't have client exported? It is `export default client`. 
                            // Yes we can import it.

                            const { default: client } = await import('../api/client');
                            const resPos = await client.get('/locations/positions');
                            const occupiedSet = new Set(resPos.data?.items?.map((it: any) => it.posCode) || []);

                            const hallSpots: string[] = [];
                            for (let i = 1; i <= 30; i++) { // Check up to 30 to be safe
                                const { formatCode } = await import('../lib/locationCodes');
                                // Fix: Add capacity prop
                                const code = formatCode({ warehouse: whId as any, zone: 'S', pos: i, capacity: 1 });
                                if (!occupiedSet.has(code)) {
                                    hallSpots.push(code);
                                }
                            }

                            if (hallSpots.length < droppedPositions.length) {
                                throw new Error(`Không đủ chỗ trống ở Sảnh kho ${whId}. (Trống ${hallSpots.length}, Cần ${droppedPositions.length})`);
                            }

                            // EXECUTE MOVES
                            const batchMoves = [];
                            const movesToLog = [];
                            const user = "MobileUser"; // Or get from auth if avaiable

                            for (let i = 0; i < droppedPositions.length; i++) {
                                const fromPos = droppedPositions[i];
                                const toPos = hallSpots[i];
                                // Use strict fallback if lotCode missing (should not happen)
                                const lotCode = order.lotCodes[order.locations.indexOf(fromPos)] || "UNKNOWN";

                                batchMoves.push(
                                    exportOrderApi.moveToHall(fromPos, toPos, lotCode, user)
                                );

                                movesToLog.push({
                                    originalPosition: fromPos,
                                    newPosition: toPos,
                                    lotCode: lotCode,
                                    warehouse: whId.toString(),
                                    movedBy: user
                                });
                            }

                            // Execute API calls
                            await Promise.all(batchMoves);

                            // LOG MOVEMENTS removed
                            // await exportOrderApi.logMovedPosition(order.id, movesToLog);

                            // Success
                            Alert.alert("Thành công", `Đã hạ ${droppedPositions.length} vị trí xuống sảnh!`);

                            // Clear dropped state locally?
                            // Optional: clear to avoid confusion.
                            // Or keep them green? Green means "Dropped". 
                            // If they are physically in Hall now, they are technically "Dropped".
                            // But they will disappear from the "Row/Level" list if we refresh order?
                            // Yes, if layout changes, they might move to Zone S group.
                            // So let's clear dropped state for these keys to reset UI.
                            setDroppedGroups({});
                            AsyncStorage.removeItem(`dropped_${order.id}`); // Clear storage

                            // Refresh data
                            if (onRefresh) onRefresh();

                        } catch (e: any) {
                            Alert.alert("Lỗi", e.message || "Đồng bộ thất bại");
                            console.error(e);
                        } finally {
                            setIsSyncing(false);
                        }
                    }
                }
            ]
        );
    };

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleDropped = (key: string) => {
        setDroppedGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const statsData = useMemo(() => {
        if (!order || !order.locations) return [];

        // Map: Warehouse -> Zone -> RowLevel -> { row, level, positions: [], lotIndices: [], totalQty: 0, unit: '' }
        const stats = new Map<number, Map<string, Map<string, { row: number, level: number, positions: string[], lotIndices: number[], totalQty: number, unit: string }>>>();

        order.locations.forEach((loc, idx) => {
            const parsed = parseCode(loc);

            // Calculate Qty if items available
            let qty = 0;
            let unit = "Thùng";

            // Try to find matching item in order details if available
            if (order.items) {
                const item = order.items.find((it: any) => it.position === loc || it.lotCode === order.lotCodes[idx]);
                if (item) {
                    qty = item.quantity ?? item.totalQty ?? 0;
                    unit = item.unit || "Thùng";
                }
            }

            if (parsed) {
                const wh = parsed.warehouse;
                const zn = parsed.zone;
                const row = parsed.row || 0;
                const level = parsed.level || 0;

                // Key for Row/Level
                const rowLevelKey = zn === 'S' ? 'S' : `${row}-${level}`;

                if (!stats.has(wh)) stats.set(wh, new Map());
                const whMap = stats.get(wh)!;

                if (!whMap.has(zn)) whMap.set(zn, new Map());
                const znMap = whMap.get(zn)!;

                if (!znMap.has(rowLevelKey)) znMap.set(rowLevelKey, { row, level, positions: [], lotIndices: [], totalQty: 0, unit: unit });
                const groupData = znMap.get(rowLevelKey)!;

                groupData.positions.push(loc);
                groupData.lotIndices.push(idx);
                groupData.totalQty += qty;
                if (groupData.totalQty > 0 && !groupData.unit) groupData.unit = unit;
            }
        });

        // Convert to Array for rendering
        // Sort Warehouses
        const sortedWh = Array.from(stats.entries()).sort(([a], [b]) => a - b).map(([wh, whMap]) => {

            // Calc Wh totals
            let whTotalPos = 0;
            let whTotalQty = 0;
            let whUnit = "";
            let hallPos = 0;
            let shelfPos = 0;

            // Re-implementing correctly using for...of entries on whMap
            for (const [zn, znMap] of whMap.entries()) {
                const isHall = zn === 'S' || zn === 'Hall';
                for (const d of znMap.values()) {
                    const count = d.positions.length;
                    whTotalPos += count;
                    whTotalQty += d.totalQty;
                    if (!whUnit && d.unit) whUnit = d.unit;

                    if (isHall) hallPos += count;
                    else shelfPos += count;
                }
            }

            // Sort Zones
            const sortedZones = Array.from(whMap.entries()).sort(([a], [b]) => {
                if (a === 'S') return 1;
                if (b === 'S') return -1;
                return a.localeCompare(b);
            }).map(([zn, znMap]) => {

                // Sort Row/Levels
                const sortedDetails = Array.from(znMap.entries()).sort(([keyA, detailsA], [keyB, detailsB]) => {
                    if (keyA === 'S') return -1;
                    if (keyB === 'S') return 1;
                    // Sort by Row then Level
                    if (detailsA.row !== detailsB.row) return detailsA.row - detailsB.row;
                    return detailsA.level - detailsB.level;
                }).map(([key, details]) => ({
                    key,
                    ...details
                }));

                const znTotalPos = sortedDetails.reduce((acc, curr) => acc + curr.positions.length, 0);
                const znTotalQty = sortedDetails.reduce((acc, curr) => acc + curr.totalQty, 0);

                return {
                    zone: zn,
                    totalPos: znTotalPos,
                    totalQty: znTotalQty,
                    unit: whUnit || "Thùng",
                    details: sortedDetails
                };
            });

            return {
                warehouse: wh,
                totalPos: whTotalPos,
                totalQty: whTotalQty,
                unit: whUnit || "Thùng",
                hallPos,
                shelfPos,
                zones: sortedZones
            };
        });

        return sortedWh;
    }, [order]);

    if (!order) return null;

    return (
        <ScrollView className="flex-1 px-5 pt-4" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            {/* Color Legend */}
            <View className="bg-white rounded-xl p-3 mb-4 border border-zinc-200 shadow-sm">
                <Text className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Chú thích màu ưu tiên</Text>
                <View className="flex-row flex-wrap gap-3">
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-4 h-4 rounded bg-red-600" />
                        <Text className="text-[11px] text-zinc-600">Lấy trước</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-4 h-4 rounded bg-yellow-400" />
                        <Text className="text-[11px] text-zinc-600">Ưu tiên 2</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-4 h-4 rounded bg-amber-800" />
                        <Text className="text-[11px] text-zinc-600">Ưu tiên 3</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-4 h-4 rounded bg-purple-600" />
                        <Text className="text-[11px] text-zinc-600">Ưu tiên 4</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-4 h-4 rounded bg-blue-600" />
                        <Text className="text-[11px] text-zinc-600">Bình thường</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-4 h-4 rounded bg-emerald-500" />
                        <Text className="text-[11px] text-zinc-600">Nháp đã hạ</Text>
                    </View>
                </View>
            </View>

            {/* Sync Button */}
            <View className="flex-row justify-end mb-4">
                <TouchableOpacity
                    onPress={handleSync}
                    disabled={isSyncing}
                    className={`flex-row items-center gap-2 px-4 py-2 rounded-lg shadow-sm ${isSyncing ? 'bg-zinc-100' : 'bg-emerald-500'}`}
                >
                    {isSyncing ? (
                        <ActivityIndicator color="#10b981" size="small" />
                    ) : (
                        <MaterialCommunityIcons name="cloud-upload-outline" size={18} color="white" />
                    )}
                    <Text className={`font-medium ${isSyncing ? 'text-zinc-400' : 'text-white'}`}>
                        {isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ hạ sảnh'}
                    </Text>
                </TouchableOpacity>
            </View>

            {statsData.length === 0 ? (
                <Text className="text-center text-zinc-400 mt-10">Không có dữ liệu vị trí hợp lệ</Text>
            ) : (
                statsData.map(whItem => (
                    <View key={whItem.warehouse} className="mb-6 bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
                        <View className="bg-zinc-100 px-3 py-2 border-b border-zinc-200 flex-row justify-between items-center">
                            <View className="gap-0.5">
                                <View className="flex-row items-center gap-1.5">
                                    <MaterialCommunityIcons name="warehouse" size={18} color="#2563eb" />
                                    <Text className="font-black text-base text-zinc-900">Kho {whItem.warehouse}</Text>
                                </View>
                                <Text className="text-zinc-500 font-medium text-[11px] ml-6">
                                    Tổng: <Text className="text-blue-700 font-bold">{whItem.totalPos} vị trí</Text>
                                    {whItem.totalQty > 0 && <Text className="font-normal text-zinc-400"> ({whItem.totalQty} {whItem.unit})</Text>}
                                </Text>
                            </View>

                            <View className="items-end gap-1">
                                <View className="flex-row items-center gap-1.5">
                                    <Text className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Trên kệ</Text>
                                    <View className="bg-white px-1.5 py-0.5 rounded border border-zinc-200 min-w-[20px] items-center shadow-sm">
                                        <Text className="text-zinc-900 font-bold text-[11px]">{whItem.shelfPos}</Text>
                                    </View>
                                </View>
                                <View className="flex-row items-center gap-1.5">
                                    <Text className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Dưới sảnh</Text>
                                    <View className="bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 min-w-[20px] items-center shadow-sm">
                                        <Text className="text-blue-700 font-bold text-[11px]">{whItem.hallPos}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Zones */}
                        <View className="p-4 gap-4">
                            {whItem.zones.map(znItem => (
                                <View key={znItem.zone}>
                                    <View className="flex-row items-center gap-2 mb-2">
                                        <Text className="font-bold text-zinc-500 uppercase text-xs">
                                            {znItem.zone === 'S' ? 'KHU VỰC SẢNH' : `KHU VỰC ${znItem.zone}`}
                                        </Text>
                                        <View className="h-[1px] flex-1 bg-zinc-100" />
                                        <View className="h-[1px] flex-1 bg-zinc-100" />
                                        <View className="flex-row items-center gap-1">
                                            <Text className="text-xs text-zinc-400 font-medium">{znItem.totalPos} pos</Text>
                                            {znItem.totalQty > 0 && <Text className="text-xs text-blue-500 font-bold">({znItem.totalQty})</Text>}
                                        </View>
                                    </View>

                                    {/* Details (Row/Level) */}
                                    <View className="gap-2.5">
                                        {znItem.details.map((detail, dIdx) => {
                                            const uniqueKey = `${whItem.warehouse}-${znItem.zone}-${detail.key}`;
                                            const isExpanded = expandedGroups[uniqueKey];
                                            const isDropped = droppedGroups[uniqueKey];

                                            return (
                                                <View
                                                    key={detail.key}
                                                    className={`bg-zinc-50 rounded-xl border p-3 ${isDropped ? 'border-emerald-200 bg-emerald-50' : 'border-zinc-100'}`}
                                                >
                                                    <View className="flex-row justify-between items-center mb-2">
                                                        <View className="flex-row items-center gap-2">
                                                            <View className={`w-1.5 h-1.5 rounded-full ${isDropped ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                                                            <Text className={`font-bold text-sm ${isDropped ? 'text-emerald-700' : 'text-zinc-700'}`}>
                                                                {znItem.zone === 'S' ? 'Sảnh' : `Dãy ${detail.row} - Tầng ${detail.level}`}
                                                            </Text>
                                                            <TouchableOpacity
                                                                onPress={() => toggleDropped(uniqueKey)}
                                                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isDropped ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-zinc-300'}`}
                                                            >
                                                                <Text className={`text-[10px] font-bold ${isDropped ? 'text-white' : 'text-zinc-400'}`}>
                                                                    {isDropped ? 'Đã hạ' : 'Hạ hàng'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                        <View className="flex-row items-center gap-2">
                                                            <Text className={`text-xs text-right ${isDropped ? 'text-emerald-600' : 'text-zinc-400'}`}>
                                                                {detail.positions.length} LOT
                                                                {detail.totalQty > 0 && ` • ${detail.totalQty} ${detail.unit}`}
                                                            </Text>
                                                            <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={isDropped ? "#059669" : "#a1a1aa"} />
                                                        </View>
                                                    </View>

                                                    {/* Grid Visualization - Click here to expand */}
                                                    <TouchableOpacity onPress={() => toggleGroup(uniqueKey)}>
                                                        {znItem.zone === 'S' ? (
                                                            <View className="flex-row flex-wrap gap-1 mt-1">
                                                                {detail.positions.map((pos, idx) => {
                                                                    const parsed = parseCode(pos);
                                                                    // Priority color lookup
                                                                    const itemAtPos = order.items?.find((it: any) => it.position === pos);
                                                                    let bgClass = isDropped ? 'bg-emerald-500 border-emerald-600' : 'bg-blue-600 border-blue-700';
                                                                    if (itemAtPos && !isDropped) {
                                                                        if (itemAtPos.priorityLevel === 'red' || (itemAtPos.isPriority && !itemAtPos.priorityLevel)) {
                                                                            bgClass = 'bg-red-600 border-red-700';
                                                                        } else if (itemAtPos.priorityLevel === 'yellow') {
                                                                            bgClass = 'bg-yellow-400 border-yellow-500';
                                                                        } else if (itemAtPos.priorityLevel === 'brown') {
                                                                            bgClass = 'bg-amber-800 border-amber-900';
                                                                        } else if (itemAtPos.priorityLevel === 'purple') {
                                                                            bgClass = 'bg-purple-600 border-purple-700';
                                                                        }
                                                                    }
                                                                    return (
                                                                        <View
                                                                            key={pos}
                                                                            className={`border rounded-md w-8 h-8 items-center justify-center ${bgClass}`}
                                                                        >
                                                                            <Text className={`text-[10px] font-bold ${itemAtPos?.priorityLevel === 'yellow' ? 'text-black' : 'text-white'}`}>
                                                                                {parsed?.pos || idx + 1}
                                                                            </Text>
                                                                        </View>
                                                                    );
                                                                })}
                                                            </View>
                                                        ) : (
                                                            <View className="flex-row gap-1 h-8 mt-1">
                                                                {[1, 2, 3, 4, 5, 6, 7, 8].map(posNum => {
                                                                    // Find actual position code matching this posNum
                                                                    const matchingPos = detail.positions.find(p => {
                                                                        const parsed = parseCode(p);
                                                                        return parsed && parsed.pos === posNum;
                                                                    });
                                                                    const isTarget = !!matchingPos;

                                                                    // Priority color lookup
                                                                    let bgClass = 'bg-white border-zinc-200';
                                                                    let textClass = 'text-zinc-300';
                                                                    if (isTarget) {
                                                                        const itemAtPos = order.items?.find((it: any) => it.position === matchingPos);
                                                                        bgClass = isDropped ? 'bg-emerald-500 border-emerald-600' : 'bg-blue-600 border-blue-700';
                                                                        textClass = 'text-white';
                                                                        if (itemAtPos && !isDropped) {
                                                                            if (itemAtPos.priorityLevel === 'red' || (itemAtPos.isPriority && !itemAtPos.priorityLevel)) {
                                                                                bgClass = 'bg-red-600 border-red-700';
                                                                            } else if (itemAtPos.priorityLevel === 'yellow') {
                                                                                bgClass = 'bg-yellow-400 border-yellow-500';
                                                                                textClass = 'text-black';
                                                                            } else if (itemAtPos.priorityLevel === 'brown') {
                                                                                bgClass = 'bg-amber-800 border-amber-900';
                                                                            } else if (itemAtPos.priorityLevel === 'purple') {
                                                                                bgClass = 'bg-purple-600 border-purple-700';
                                                                            }
                                                                        }
                                                                    } else if (isDropped) {
                                                                        bgClass = 'bg-white border-emerald-200 opacity-60';
                                                                        textClass = 'text-emerald-200';
                                                                    }

                                                                    return (
                                                                        <View
                                                                            key={posNum}
                                                                            className={`flex-1 rounded-md items-center justify-center border ${bgClass}`}
                                                                        >
                                                                            <Text className={`text-[10px] font-bold ${textClass}`}>
                                                                                {posNum}
                                                                            </Text>
                                                                        </View>
                                                                    );
                                                                })}
                                                            </View>
                                                        )}
                                                    </TouchableOpacity>


                                                    {/* Expanded List - Product Details */}
                                                    {isExpanded && (
                                                        <View className="mt-3 bg-white rounded-lg p-3 border border-zinc-100 gap-3">
                                                            {detail.lotIndices.map(idx => {
                                                                const lotCode = order.lotCodes[idx];
                                                                const item = order.items?.find((it: any) => it.lotCode === lotCode);

                                                                return (
                                                                    <View key={idx} className="border-b border-zinc-50 pb-2 last:border-0 last:pb-0">
                                                                        <View className="flex-row justify-between mb-1">
                                                                            <Text className="text-xs font-bold text-blue-600">{lotCode}</Text>
                                                                            <Text className="text-xs font-medium text-zinc-400">{order.locations[idx]}</Text>
                                                                        </View>

                                                                        {item ? (
                                                                            <View className="pl-2 border-l-2 border-emerald-100">
                                                                                <Text className="text-xs font-bold text-zinc-700">{item.productCode} - {item.productName}</Text>
                                                                                <View className="flex-row gap-2 mt-0.5">
                                                                                    <Text className="text-[10px] text-zinc-500">
                                                                                        SL: <Text className="font-bold text-emerald-600">{item.quantity ?? item.totalQty ?? 0} {item.unit}</Text>
                                                                                    </Text>
                                                                                    {item.packDate && <Text className="text-[10px] text-zinc-400">NSX: {item.packDate}</Text>}
                                                                                </View>
                                                                                {/* Tag Rendering (Simplified - Offline Only) */}
                                                                                {item.tags?.length > 0 && (
                                                                                    <View className="flex-row flex-wrap gap-1 mt-1">
                                                                                        {(item.tags || []).flatMap((rawTag: string) => {
                                                                                            // Logic matched from Web: Split ONLY by '>'
                                                                                            return rawTag.split('>')
                                                                                                .map(t => t.trim())
                                                                                                .filter(t => t && t !== '@')
                                                                                                .map((tag, tagIdx) => {
                                                                                                    const upper = tag.toUpperCase();
                                                                                                    let style = "bg-zinc-100 border-zinc-200";
                                                                                                    let textStyle = "text-zinc-600";

                                                                                                    if (upper.startsWith("CONT")) {
                                                                                                        style = "bg-amber-100 border-amber-200";
                                                                                                        textStyle = "text-amber-800";
                                                                                                    } else if (upper.startsWith("KT")) {
                                                                                                        style = "bg-blue-100 border-blue-200";
                                                                                                        textStyle = "text-blue-800";
                                                                                                    } else if (upper.includes("HÀNG") || upper.includes("ĐẸP") || upper.includes("XẤU")) {
                                                                                                        style = "bg-purple-100 border-purple-200";
                                                                                                        textStyle = "text-purple-800";
                                                                                                    }

                                                                                                    return (
                                                                                                        <View key={`${rawTag}-${tagIdx}`} className={`px-1.5 py-0.5 rounded border ${style}`}>
                                                                                                            <Text className={`text-[10px] font-medium ${textStyle}`}>{tag}</Text>
                                                                                                        </View>
                                                                                                    );
                                                                                                });
                                                                                        })}
                                                                                    </View>
                                                                                )}
                                                                            </View>
                                                                        ) : (
                                                                            <Text className="text-[10px] italic text-zinc-400 pl-2">Chưa có thông tin sp</Text>
                                                                        )}
                                                                    </View>
                                                                );
                                                            })}

                                                            {/* Explicit Close Button */}
                                                            <TouchableOpacity
                                                                onPress={() => toggleGroup(uniqueKey)}
                                                                className="mt-2 bg-zinc-100 py-2 rounded-lg items-center active:bg-zinc-200"
                                                            >
                                                                <Text className="text-xs font-bold text-zinc-500">Thu gọn</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                ))
            )}
        </ScrollView>
    );
}
