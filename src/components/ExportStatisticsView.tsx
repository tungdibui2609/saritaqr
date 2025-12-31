import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { parseCode } from '../lib/locationCodes';
import { lotApi } from '../api/client';

interface ExportStatisticsViewProps {
    order: {
        id: string;
        locations: string[];
        lotCodes: string[];
        items?: any[]; // Need items for quantity info
    } | null;
}

export default function ExportStatisticsView({ order }: ExportStatisticsViewProps) {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [liveTags, setLiveTags] = useState<Record<string, string[]>>({});

    // Fetch live tags on mount
    useEffect(() => {
        if (!order || !order.lotCodes) return;

        const fetchLiveTags = async () => {
            try {
                // Get unique lot codes
                const uniqueLots = Array.from(new Set(order.lotCodes));
                if (uniqueLots.length === 0) return;

                // Fetch individually (optimization needed if lots > 20)
                const promises = uniqueLots.map(code => lotApi.getList({ q: code }));
                const results = await Promise.all(promises);

                const newTags: Record<string, string[]> = {};
                results.forEach((res: any, idx) => {
                    const code = uniqueLots[idx];
                    if (res?.items) {
                        // Find exact match
                        const match = res.items.find((it: any) => it.lotCode === code);
                        if (match && match.tags) {
                            newTags[code] = match.tags;
                        }
                    }
                });

                setLiveTags(prev => ({ ...prev, ...newTags }));
            } catch (e) {
                console.error("Failed to fetch live tags", e);
            }
        };

        fetchLiveTags();
    }, [order]);

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
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

                                            return (
                                                <TouchableOpacity
                                                    key={detail.key}
                                                    onPress={() => toggleGroup(uniqueKey)}
                                                    className="bg-zinc-50 rounded-xl border border-zinc-100 p-3"
                                                >
                                                    <View className="flex-row justify-between items-center mb-2">
                                                        <View className="flex-row items-center gap-2">
                                                            <View className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                            <Text className="font-bold text-zinc-700 text-sm">
                                                                {znItem.zone === 'S' ? 'Sảnh' : `Dãy ${detail.row} - Tầng ${detail.level}`}
                                                            </Text>
                                                        </View>
                                                        <View className="flex-row items-center gap-2">
                                                            <Text className="text-zinc-400 text-xs text-right">
                                                                {detail.positions.length} LOT
                                                                {detail.totalQty > 0 && ` • ${detail.totalQty} ${detail.unit}`}
                                                            </Text>
                                                            <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color="#a1a1aa" />
                                                        </View>
                                                    </View>

                                                    {/* Grid Visualization */}
                                                    {znItem.zone === 'S' ? (
                                                        <View className="flex-row flex-wrap gap-1 mt-1">
                                                            {detail.positions.map((pos, idx) => {
                                                                const parsed = parseCode(pos);
                                                                return (
                                                                    <View
                                                                        key={pos}
                                                                        className="bg-blue-600 border border-blue-700 rounded-md w-8 h-8 items-center justify-center"
                                                                    >
                                                                        <Text className="text-[10px] font-bold text-white">
                                                                            {parsed?.pos || idx + 1}
                                                                        </Text>
                                                                    </View>
                                                                );
                                                            })}
                                                        </View>
                                                    ) : (
                                                        <View className="flex-row gap-1 h-8 mt-1">
                                                            {[1, 2, 3, 4, 5, 6, 7, 8].map(posNum => {
                                                                const isTarget = detail.positions.some(p => {
                                                                    const parsed = parseCode(p);
                                                                    return parsed && parsed.pos === posNum;
                                                                });

                                                                return (
                                                                    <View
                                                                        key={posNum}
                                                                        className={`flex-1 rounded-md items-center justify-center border ${isTarget
                                                                            ? 'bg-blue-600 border-blue-700'
                                                                            : 'bg-white border-zinc-200'
                                                                            }`}
                                                                    >
                                                                        <Text
                                                                            className={`text-[10px] font-bold ${isTarget ? 'text-white' : 'text-zinc-300'}`}
                                                                        >
                                                                            {posNum}
                                                                        </Text>
                                                                    </View>
                                                                );
                                                            })}
                                                        </View>
                                                    )}


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
                                                                                {/* Logic to merge live tags with fallback to item tags */}
                                                                                {(liveTags[lotCode]?.length > 0 || item.tags?.length > 0) && (
                                                                                    <View className="flex-row flex-wrap gap-1 mt-1">
                                                                                        {(liveTags[lotCode] || item.tags || []).flatMap((rawTag: string) => {
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
                                                </TouchableOpacity>
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
