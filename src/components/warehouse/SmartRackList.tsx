import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ZoneData, LevelData } from '../../types/warehouse';
import { warehouseApi } from '../../api/client';
import clsx from 'clsx';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SmartRackListProps {
    zones: ZoneData[];
    isLoading: boolean;
    warehouseId: number;
}

interface ColorTheme {
    base: string;   // 500 - Main background
    text: string;   // 700 - Dark text
    light: string;  // 50 - Light background
    border: string; // 200 - Border
}

// Robust Palette - High Contrast & Shuffled to avoid similar neighbors
const GENERIC_PALETTE: ColorTheme[] = [
    { base: '#ef4444', text: '#b91c1c', light: '#fef2f2', border: '#fecaca' }, // Red
    { base: '#3b82f6', text: '#1d4ed8', light: '#eff6ff', border: '#bfdbfe' }, // Blue
    { base: '#f59e0b', text: '#b45309', light: '#fffbeb', border: '#fde68a' }, // Amber
    { base: '#a855f7', text: '#7e22ce', light: '#faf5ff', border: '#e9d5ff' }, // Purple
    { base: '#10b981', text: '#047857', light: '#ecfdf5', border: '#99f6e4' }, // Emerald
    { base: '#ec4899', text: '#be185d', light: '#fdf2f8', border: '#fbcfe8' }, // Pink
    { base: '#06b6d4', text: '#0e7490', light: '#ecfeff', border: '#a5f3fc' }, // Cyan
    { base: '#f97316', text: '#c2410c', light: '#fff7ed', border: '#fed7aa' }, // Orange
    { base: '#6366f1', text: '#4338ca', light: '#eef2ff', border: '#c7d2fe' }, // Indigo
    { base: '#84cc16', text: '#4d7c0f', light: '#f7fee7', border: '#d9f99d' }, // Lime
    { base: '#14b8a6', text: '#0f766e', light: '#f0fdfa', border: '#99f6e4' }, // Teal
    { base: '#eab308', text: '#a16207', light: '#fefce8', border: '#fef08a' }, // Yellow
];

// Reserved themes for specific product prefixes (e.g., 'SP-A', 'SP-B')
// This object would typically be populated with specific product codes and their desired themes.
// For example: { 'SP-A': { base: '#FF0000', ... }, 'SP-B': { base: '#00FF00', ... } }
const RESERVED_THEMES: Record<string, ColorTheme> = {};

const DEFAULT_THEME: ColorTheme = { base: '#e4e4e7', text: '#71717a', light: '#fafafa', border: '#f4f4f5' }; // Zinc 200/400/50
const OTHER_THEME: ColorTheme = { base: '#a1a1aa', text: '#3f3f46', light: '#f4f4f5', border: '#e4e4e7' };   // Zinc 400/700/100

export default function SmartRackList({ zones, isLoading, warehouseId }: SmartRackListProps) {
    const [productCodes, setProductCodes] = useState<string[]>([]);
    const [customColors, setCustomColors] = useState<Record<string, ColorTheme>>({});
    const [selectedLevel, setSelectedLevel] = useState<{ level: LevelData, rackName: string } | null>(null);
    const [groupByProduct, setGroupByProduct] = useState(false);

    // Load data and custom settings
    useEffect(() => {
        loadCustomColors();

        warehouseApi.getColors()
            .then(data => {
                if (data && typeof data === 'object') {
                    setProductCodes(Object.keys(data));
                }
            })
            .catch(err => console.error("Failed to load product colors", err));
    }, []);

    // Also reload when refreshing props if needed, or we can assume re-mount on tab switch
    // App.tsx logic suggests unmount/mount on tab switch, so simple useEffect is fine.

    const loadCustomColors = async () => {
        try {
            const saved = await AsyncStorage.getItem('custom_product_colors');
            if (saved) {
                setCustomColors(JSON.parse(saved));
            }
        } catch (error) {
            console.error("Failed to lead custom colors", error);
        }
    };

    const getProductTheme = (productIdentifier?: string): ColorTheme => {
        if (!productIdentifier) return DEFAULT_THEME;

        const idUpper = productIdentifier.toUpperCase();
        if (idUpper.includes('OTHER') || idUpper === 'KHAC') return OTHER_THEME;

        // 1. Check Custom Settings First
        if (customColors[idUpper]) {
            return customColors[idUpper];
        }

        // 2. Check Reserved Priorities (Default Fallbacks if not customized)
        for (const [prefix, theme] of Object.entries(RESERVED_THEMES)) {
            if (idUpper.startsWith(prefix)) return theme;
        }

        // 3. Hash Generation for others
        let hash = 0;
        for (let i = 0; i < idUpper.length; i++) {
            hash = idUpper.charCodeAt(i) + ((hash << 5) - hash);
        }

        const index = Math.abs(hash) % GENERIC_PALETTE.length;
        return GENERIC_PALETTE[index];
    };

    const handleCloseModal = () => {
        setSelectedLevel(null);
        setGroupByProduct(false);
    };

    if (isLoading) {
        return (
            <View className="p-6 items-center">
                <Text className="text-zinc-400">Đang tải dữ liệu kho...</Text>
            </View>
        );
    }

    return (
        <View className="bg-white rounded-xl border border-zinc-200 shadow-sm relative mb-20">
            {/* Modal Detail */}
            <Modal
                visible={!!selectedLevel}
                transparent={true}
                animationType="fade"
                onRequestClose={handleCloseModal}
            >
                <View className="flex-1 bg-black/50 justify-center items-center p-4">
                    <View className="bg-white rounded-2xl w-full max-h-[80%] overflow-hidden shadow-xl">
                        <View className="p-4 border-b border-zinc-200 flex-row justify-between items-center bg-zinc-50">
                            <View className="flex-1">
                                <Text className="font-bold text-lg text-zinc-900">
                                    {selectedLevel?.rackName} - Tầng {selectedLevel?.level.levelNumber}
                                </Text>
                                <Text className="text-xs text-zinc-500">
                                    {selectedLevel?.level.product
                                        ? `SP chính: ${selectedLevel?.level.product}`
                                        : 'Chưa có sản phẩm chính'}
                                </Text>
                            </View>

                            <View className="flex-row items-center gap-2">
                                {/* Group Toggle Button */}
                                <TouchableOpacity
                                    onPress={() => setGroupByProduct(!groupByProduct)}
                                    className={`px-3 py-1.5 rounded-lg border flex-row items-center gap-1 ${groupByProduct
                                            ? 'bg-blue-50 border-blue-200'
                                            : 'bg-white border-zinc-200'
                                        }`}
                                >
                                    <Feather
                                        name={groupByProduct ? "layers" : "list"}
                                        size={14}
                                        color={groupByProduct ? "#2563eb" : "#71717a"}
                                    />
                                    <Text className={`text-xs font-bold ${groupByProduct ? 'text-blue-600' : 'text-zinc-600'}`}>
                                        {groupByProduct ? 'Gom SP' : 'Vị trí'}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={handleCloseModal}
                                    className="p-2 bg-zinc-100 rounded-full ml-1"
                                >
                                    <Feather name="x" size={20} color="#71717a" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <ScrollView className="px-4">
                            {(() => {
                                let rawItems: any = selectedLevel?.level.items;
                                let visibleItems: any[] = [];
                                if (Array.isArray(rawItems)) {
                                    visibleItems = [...rawItems];
                                } else if (rawItems && typeof rawItems === 'object') {
                                    visibleItems = Object.values(rawItems);
                                }

                                if (visibleItems.length === 0) {
                                    return (
                                        <View className="py-8 items-center">
                                            <Text className="text-zinc-400 italic">Không có dữ liệu chi tiết</Text>
                                        </View>
                                    );
                                }

                                // MODE 1: GROUP BY PRODUCT
                                if (groupByProduct) {
                                    const groupedByCode: Record<string, any[]> = {};
                                    visibleItems.forEach(item => {
                                        const code = item.code || 'UNKNOWN';
                                        if (!groupedByCode[code]) groupedByCode[code] = [];
                                        groupedByCode[code].push(item);
                                    });
                                    const sortedCodes = Object.keys(groupedByCode).sort();

                                    return (
                                        <View className="pb-4">
                                            {sortedCodes.map((code) => {
                                                const items = groupedByCode[code];
                                                const theme = getProductTheme(code);
                                                const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
                                                const unit = items[0]?.unit || '';

                                                return (
                                                    <View key={code} className="py-2 border-b border-zinc-100 last:border-0">
                                                        <View className="flex-row items-center justify-between mb-2 pt-2">
                                                            <View className="flex-row items-center gap-2">
                                                                <View
                                                                    className="px-2 py-0.5 rounded"
                                                                    style={{ backgroundColor: theme.base }}
                                                                >
                                                                    <Text className="text-white font-mono font-bold text-xs">
                                                                        {code}
                                                                    </Text>
                                                                </View>
                                                                <Text className="text-xs font-bold text-zinc-500">
                                                                    {items.length} vị trí
                                                                </Text>
                                                            </View>
                                                            <View className="flex-row items-baseline gap-1">
                                                                <Text className="font-bold text-zinc-900">{totalQty}</Text>
                                                                <Text className="text-xs text-zinc-400">{unit}</Text>
                                                            </View>
                                                        </View>

                                                        <View className="pl-2 gap-2">
                                                            {items.map((item: any, idx: number) => (
                                                                <View key={idx} className="flex-row items-center justify-between bg-zinc-50 p-2 rounded border border-zinc-100">
                                                                    <View className="flex-1">
                                                                        <View className="flex-row items-center gap-2 mb-0.5">
                                                                            <Feather name="map-pin" size={10} color="#71717a" />
                                                                            <Text className="font-bold text-xs text-zinc-700">Pallet {item.position}</Text>
                                                                        </View>
                                                                        <Text className="text-[10px] text-zinc-500" numberOfLines={1}>{item.name}</Text>
                                                                        {/* Secondary Codes / Tags */}
                                                                        {item.tags && item.tags.length > 0 && (
                                                                            <View className="flex-row flex-wrap gap-1 mt-1">
                                                                                {item.tags.map((tag: string, tagIdx: number) => {
                                                                                    const parts = tag.split('>').filter(p => p.trim() !== '@').map(p => p.trim()).filter(p => p !== "");
                                                                                    if (parts.length === 0) return null;
                                                                                    return (
                                                                                        <View key={tagIdx} className="flex-row items-center">
                                                                                            {parts.map((part, i) => (
                                                                                                <View key={i} className={`px-1.5 py-[1px] border-y border-l last:border-r ${i === 0 ? "bg-amber-50 border-amber-200" : "bg-zinc-50 border-zinc-200"} ${i === 0 ? "rounded-l" : ""} ${i === parts.length - 1 ? "rounded-r" : ""}`}>
                                                                                                    <Text className={`text-[9px] font-mono ${i === 0 ? "text-amber-700 font-bold" : "text-zinc-500"}`}>{part}</Text>
                                                                                                </View>
                                                                                            ))}
                                                                                        </View>
                                                                                    );
                                                                                })}
                                                                            </View>
                                                                        )}
                                                                    </View>
                                                                    <View className="items-end">
                                                                        <Text className="font-bold text-sm text-zinc-900">{item.quantity}</Text>
                                                                        <Text className="text-[10px] text-zinc-400">{item.unit}</Text>
                                                                    </View>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    );
                                }

                                // MODE 2: GROUP BY POSITION (Default)
                                const groupedItems: Record<number, any[]> = {};
                                visibleItems.forEach(item => {
                                    const pos = item.position || 0;
                                    if (!groupedItems[pos]) groupedItems[pos] = [];
                                    groupedItems[pos].push(item);
                                });

                                const sortedPositions = Object.keys(groupedItems).map(Number).sort((a, b) => a - b);

                                return (
                                    <View className="pb-4">
                                        {sortedPositions.map((pos) => (
                                            <View key={pos} className="py-2 border-b border-zinc-100 last:border-0">
                                                <View className="flex-row items-center gap-2 mb-2 pt-2">
                                                    <Feather name="box" size={14} color="#52525b" />
                                                    <Text className="font-bold text-zinc-800">Pallet {pos}</Text>
                                                </View>

                                                <View className="pl-6 gap-3">
                                                    {groupedItems[pos].map((item: any, idx: number) => {
                                                        const theme = getProductTheme(item.code);
                                                        return (
                                                            <View key={idx} className="flex-row items-start justify-between">
                                                                <View className="flex-1 pr-2">
                                                                    <View className="flex-row items-center gap-2 mb-1">
                                                                        <View
                                                                            className="px-2 py-0.5 rounded self-start"
                                                                            style={{ backgroundColor: theme.base }}
                                                                        >
                                                                            <Text className="text-white font-mono font-bold text-xs" style={{ textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 }}>
                                                                                {item.code || '?'}
                                                                            </Text>
                                                                        </View>
                                                                        <Text className="text-xs text-zinc-500 flex-1" numberOfLines={1}>{item.name}</Text>
                                                                    </View>

                                                                    {/* Secondary Codes / Tags */}
                                                                    {item.tags && item.tags.length > 0 && (
                                                                        <View className="flex-row flex-wrap gap-1 mt-1">
                                                                            {item.tags.map((tag: string, tagIdx: number) => {
                                                                                const parts = tag.split('>')
                                                                                    .filter(p => p.trim() !== '@')
                                                                                    .map(p => p.trim())
                                                                                    .filter(p => p !== "");

                                                                                if (parts.length === 0) return null;

                                                                                return (
                                                                                    <View key={tagIdx} className="flex-row items-center">
                                                                                        {parts.map((part, i) => (
                                                                                            <View
                                                                                                key={i}
                                                                                                className={`px-1.5 py-[2px] border-y border-l last:border-r ${i === 0
                                                                                                    ? "bg-amber-50 border-amber-200"
                                                                                                    : "bg-zinc-50 border-zinc-200"
                                                                                                    } ${i === 0 ? "rounded-l" : ""} ${i === parts.length - 1 ? "rounded-r" : ""}`}
                                                                                            >
                                                                                                <Text className={`text-[10px] font-mono ${i === 0 ? "text-amber-700 font-bold" : "text-zinc-500"
                                                                                                    }`}>
                                                                                                    {part}
                                                                                                </Text>
                                                                                            </View>
                                                                                        ))}
                                                                                    </View>
                                                                                );
                                                                            })}
                                                                        </View>
                                                                    )}
                                                                </View>
                                                                <View className="items-end">
                                                                    <Text className="font-bold text-base text-zinc-900">{item.quantity ? String(item.quantity) : '0'}</Text>
                                                                    <Text className="text-xs text-zinc-400">{item.unit || '-'}</Text>
                                                                </View>
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                );
                            })()}
                        </ScrollView>

                        <View className="p-3 border-t border-zinc-200 bg-zinc-50 flex-row justify-between items-center">
                            <Text className="text-xs text-zinc-500">
                                Tổng {selectedLevel?.level.used}/{selectedLevel?.level.total} vị trí
                            </Text>
                            {selectedLevel?.level.isMixed && (
                                <Text className="font-bold text-amber-600 text-xs">
                                    ⚠️ Có lẫn hàng
                                </Text>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Header / Legend */}
            <View className="p-3 border-b border-zinc-200 bg-zinc-50 rounded-t-xl">
                <View className="mb-2 flex-row items-center gap-2">
                    <Feather name="layers" size={18} color="#27272a" />
                    <Text className="font-bold text-base text-zinc-800">
                        Sơ đồ ({zones.reduce((acc, z) => acc + z.racks.length, 0)} Dãy)
                    </Text>
                </View>

                {/* Product Color Legend */}
                <View className="flex-row flex-wrap gap-2 text-xs">
                    {productCodes.map((code) => (
                        <View key={code} className="flex-row items-center gap-1">
                            <View
                                className="w-3 h-3 rounded-sm"
                                style={{ backgroundColor: getProductTheme(code).base }}
                            />
                            <Text className="text-[10px] font-medium text-zinc-600">{code}</Text>
                        </View>
                    ))}
                    <View className="flex-row items-center gap-1 border-l pl-2 border-zinc-200 ml-1">
                        <View className="w-3 h-3 rounded-sm bg-zinc-400" />
                        <Text className="text-[10px] font-medium text-zinc-600">Khác</Text>
                    </View>
                </View>
            </View>

            {/* Content */}
            <View className="p-3">
                {zones.map((zone) => (
                    <View key={zone.id} className="mb-4">
                        {/* Hall Section */}
                        {zone.id === 'B' && zone.hall && (
                            <View className="mb-4 bg-zinc-50 rounded border border-zinc-100 p-2">
                                <View className="flex-row justify-between items-center mb-2">
                                    <View className="flex-row items-center gap-2">
                                        <Text className="font-bold text-sm text-zinc-700">Sảnh</Text>
                                        <View className="bg-blue-100 px-1.5 py-0.5 rounded">
                                            <Text className="text-[10px] text-blue-700 font-medium">Sức chứa {zone.hall.total}</Text>
                                        </View>
                                    </View>
                                    <Text className="text-xs font-bold text-blue-600">
                                        {zone.hall.used}/{zone.hall.total}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    className="flex-row gap-[1px] h-6 w-full"
                                    onPress={() => setSelectedLevel({
                                        level: {
                                            id: 'hall',
                                            levelNumber: 1,
                                            total: zone.hall!.total,
                                            used: zone.hall!.used,
                                            items: zone.hall!.items || []
                                        },
                                        rackName: 'Sảnh (Khu vực đệm)'
                                    })}
                                >
                                    {Array.from({ length: zone.hall.total }).map((_, idx) => {
                                        const slotItem = zone.hall?.items?.find(i => i.position === idx + 1);
                                        const theme = slotItem ? getProductTheme(slotItem.code) : DEFAULT_THEME;
                                        return (
                                            <View
                                                key={idx}
                                                className="flex-1 h-full rounded-[1px]"
                                                style={{ backgroundColor: theme.base }}
                                            />
                                        );
                                    })}
                                </TouchableOpacity>
                            </View>
                        )}

                        <View className="flex-row items-center gap-2 mb-2">
                            <View className="bg-zinc-100 px-2 py-1 rounded">
                                <Text className="text-xs font-bold text-zinc-500 uppercase">{zone.name}</Text>
                            </View>
                            <Text className="text-[10px] text-zinc-400">
                                {zone.id === 'A' ? '5 Tầng • 8 Pallet' : '4 Tầng • 1 Pallet'}
                            </Text>
                        </View>

                        <View className="gap-2">
                            {zone.racks.map((rack) => (
                                <View key={rack.id} className="flex-row items-start gap-2 py-1 border-b border-dashed border-zinc-100 last:border-0">
                                    <View className="w-8 pt-1">
                                        <Text className="font-bold text-sm text-zinc-700">{rack.name}</Text>
                                    </View>

                                    <View className={clsx("flex-1 flex-row flex-wrap gap-1", zone.id === 'A' ? '' : 'justify-start')}>
                                        {rack.levels.map((level) => {
                                            const isFull = level.used === level.total;
                                            const productCode = level.product?.split(' ')[0] || '';

                                            // Zone A Layout
                                            if (zone.id === 'A') {
                                                return (
                                                    <TouchableOpacity
                                                        key={level.id}
                                                        onPress={() => setSelectedLevel({ level, rackName: rack.name })}
                                                        className="w-[18%] bg-zinc-100 p-1 rounded min-w-[50px]"
                                                    >
                                                        <View className="flex-row justify-between mb-1">
                                                            <Text className="text-[8px] text-zinc-500">T{level.levelNumber}</Text>
                                                            <Text className={clsx("text-[8px]", isFull ? "font-bold text-zinc-700" : "text-zinc-400")}>
                                                                {level.used}/{level.total}
                                                            </Text>
                                                        </View>
                                                        <View className="flex-row h-1.5 w-full gap-[1px]">
                                                            {Array.from({ length: level.total }).map((_, idx) => {
                                                                const slotItem = level.items?.find(i => i.position === idx + 1);
                                                                const theme = slotItem ? getProductTheme(slotItem.code) : DEFAULT_THEME;
                                                                return <View key={idx} className="flex-1 h-full rounded-[1px]" style={{ backgroundColor: theme.base }} />;
                                                            })}
                                                        </View>
                                                    </TouchableOpacity>
                                                );
                                            }

                                            // Zone B Layout (Single Large Slot)
                                            const slotItem = level.items?.find(i => i.position === 1);
                                            const theme = slotItem ? getProductTheme(slotItem.code) : DEFAULT_THEME;
                                            const hasItem = level.used > 0;

                                            // Apply theme styles if has item
                                            const containerStyle = hasItem ? {
                                                backgroundColor: theme.light,
                                                borderColor: theme.border,
                                            } : {
                                                backgroundColor: '#fafafa', // zinc-50
                                                borderColor: '#f4f4f5', // zinc-100
                                            };

                                            const textStyle = hasItem ? {
                                                color: theme.text
                                            } : {
                                                color: '#d4d4d8' // zinc-300
                                            };

                                            return (
                                                <TouchableOpacity
                                                    key={level.id}
                                                    onPress={() => setSelectedLevel({ level, rackName: rack.name })}
                                                    className="w-[22%] h-7 rounded items-center justify-center border"
                                                    style={containerStyle}
                                                >
                                                    {level.used > 0 ? (
                                                        <View className="w-full h-full justify-center items-center">
                                                            <Text className="text-[9px] font-bold" style={textStyle}>
                                                                {productCode}
                                                            </Text>
                                                        </View>
                                                    ) : (
                                                        <Text className="text-[9px]" style={textStyle}>T{level.levelNumber}</Text>
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                ))}
            </View>
        </View>
    );
}
