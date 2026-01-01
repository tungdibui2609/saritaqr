import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { warehouseApi } from '../api/client';
import { ZoneData } from '../types/warehouse';
import WarehouseStats from '../components/warehouse/WarehouseStats';
import SmartRackList from '../components/warehouse/SmartRackList';
import clsx from 'clsx';
import { Feather } from '@expo/vector-icons';

export default function WarehouseStatusScreen() {
    const [selectedWarehouse, setSelectedWarehouse] = useState(1);
    const [zones, setZones] = useState<ZoneData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isOffline, setIsOffline] = useState(false);

    // Filter State: null = All, 'A' = Zone A, 'B' = Zone B
    const [filterZone, setFilterZone] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Try fetching from API
            const data = await warehouseApi.getStatus(selectedWarehouse);
            setZones(data);
            setIsOffline(false);

            // Cache data for offline use
            await AsyncStorage.setItem(`offline_warehouse_status_${selectedWarehouse}`, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to load warehouse status:', error);

            // Fallback to cache if API fails
            try {
                const cached = await AsyncStorage.getItem(`offline_warehouse_status_${selectedWarehouse}`);
                if (cached) {
                    setZones(JSON.parse(cached));
                    setIsOffline(true);
                    // Optional: Alert user once about offline mode
                    // Alert.alert("Chế độ Offline", "Đang hiển thị dữ liệu đã lưu từ lần trước.");
                } else {
                    Alert.alert("Lỗi", "Không thể tải dữ liệu và không có bản lưu offline.");
                }
            } catch (cacheError) {
                console.error("Failed to load cache", cacheError);
            }
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, [selectedWarehouse]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadData();
    }, [loadData]);

    // Computed filtered data
    const filteredZones = useMemo(() => {
        if (!filterZone) return zones;
        return zones.filter(z => z.id === filterZone);
    }, [zones, filterZone]);

    // Available filters (dynamic based on loaded zones)
    const availableFilters = useMemo(() => {
        const uniqueIds = Array.from(new Set(zones.map(z => z.id))).sort();
        return ['ALL', ...uniqueIds];
    }, [zones]);

    return (
        <View className="flex-1 bg-zinc-50">
            {/* Header */}
            <View className="bg-white border-b border-zinc-200 shadow-sm z-10">
                <View className="px-4 py-3 flex-row justify-between items-center">
                    <View>
                        <Text className="text-xl font-bold text-zinc-900">Trạng thái kho</Text>
                        {isOffline && (
                            <View className="flex-row items-center gap-1 mt-0.5">
                                <Feather name="wifi-off" size={10} color="#f97316" />
                                <Text className="text-[10px] text-orange-500 font-medium">Chế độ Offline</Text>
                            </View>
                        )}
                    </View>

                    {/* Warehouse Selector */}
                    <View className="flex-row bg-zinc-100 rounded-lg p-1">
                        {[1, 2, 3].map((id) => (
                            <TouchableOpacity
                                key={id}
                                onPress={() => setSelectedWarehouse(id)}
                                className={clsx(
                                    "px-3 py-1.5 rounded-md",
                                    selectedWarehouse === id ? "bg-white shadow-sm" : ""
                                )}
                            >
                                <Text className={clsx(
                                    "text-xs font-bold",
                                    selectedWarehouse === id ? "text-zinc-900" : "text-zinc-500"
                                )}>
                                    Kho {id}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Zone Filter Bar */}
                {zones.length > 0 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="px-4 py-2 border-t border-zinc-100"
                    >
                        {availableFilters.map((f) => {
                            const isSelected = (f === 'ALL' && filterZone === null) || f === filterZone;
                            const label = f === 'ALL' ? 'Tất cả' : `Khu ${f}`;

                            return (
                                <TouchableOpacity
                                    key={f}
                                    onPress={() => setFilterZone(f === 'ALL' ? null : f)}
                                    className={clsx(
                                        "px-4 py-1.5 rounded-full mr-2 border",
                                        isSelected
                                            ? "bg-zinc-800 border-zinc-800"
                                            : "bg-white border-zinc-200"
                                    )}
                                >
                                    <Text className={clsx(
                                        "text-xs font-bold",
                                        isSelected ? "text-white" : "text-zinc-600"
                                    )}>
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )}
            </View>

            <ScrollView
                className="flex-1 px-4 pt-4"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                <WarehouseStats zones={filteredZones} isLoading={isLoading} />

                <SmartRackList
                    zones={filteredZones}
                    isLoading={isLoading}
                    warehouseId={selectedWarehouse}
                />

                {/* Bottom Spacer */}
                <View className="h-20" />
            </ScrollView>
        </View>
    );
}
