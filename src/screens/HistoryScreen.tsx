import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, SectionList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { database, UserOperation } from '../database/db';
import DateRangePicker from '../components/common/DateRangePicker';
import { useOfflineLookup } from '../hooks/useOfflineLookup';

// Types
type Tab = 'HA_SANH' | 'GAN_VI_TRI' | 'XUAT_KHO';

interface HistoryScreenProps {
    onBack: () => void;
}

export default function HistoryScreen({ onBack }: HistoryScreenProps) {
    const [activeTab, setActiveTab] = useState<Tab>('HA_SANH');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<UserOperation[]>([]);
    const [summary, setSummary] = useState({ count: 0, totalQty: 0 });

    // Date Filter State
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Initialize dates to start/end of day
    useEffect(() => {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const end = new Date(); end.setHours(23, 59, 59, 999);
        setStartDate(start);
        setEndDate(end);
    }, []);

    // Load data on mount and tab change
    useEffect(() => {
        loadData();
    }, [activeTab, startDate, endDate]);

    const loadData = async () => {
        setLoading(true);
        try {
            // @ts-ignore - DB types might need refresh in TS server
            const ops = database.getOperations(startDate.toISOString(), endDate.toISOString(), activeTab);
            setData(ops);

            // Summary
            const total = ops.reduce((acc: number, curr: any) => acc + (curr.quantity || 0), 0);
            setSummary({ count: ops.length, totalQty: total });

        } catch (error) {
            console.error(error);
            Alert.alert("Lỗi", "Không thể tải dữ liệu lịch sử");
        } finally {
            setLoading(false);
        }
    };

    const handleDateSelect = (start: Date, end: Date) => {
        // Set to start/end of day
        const s = new Date(start); s.setHours(0, 0, 0, 0);
        const e = new Date(end); e.setHours(23, 59, 59, 999);
        setStartDate(s);
        setEndDate(e);
    };

    // Helper to group data by date
    const sections = useMemo(() => {
        const groups: Record<string, any[]> = {};
        const now = new Date();
        const todayStr = now.toLocaleDateString('vi-VN');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('vi-VN');

        data.forEach(item => {
            const dateObj = new Date(item.timestamp);
            const dateStr = dateObj.toLocaleDateString('vi-VN');

            let title = dateStr;
            if (dateStr === todayStr) title = 'Hôm nay';
            else if (dateStr === yesterdayStr) title = 'Hôm qua';

            if (!groups[title]) groups[title] = [];
            groups[title].push(item);
        });

        // Convert to SectionList format
        return Object.keys(groups).map(title => ({
            title,
            data: groups[title]
        }));
    }, [data, activeTab]);

    // Offline Data Helpers
    const { lookupLot, reload } = useOfflineLookup();

    useEffect(() => {
        reload();
    }, []);

    const renderItem = ({ item }: { item: UserOperation }) => {
        let details: any = {};
        try {
            if (item.details) {
                const parsed = JSON.parse(item.details);
                if (typeof parsed === 'string') {
                    try { details = JSON.parse(parsed); } catch (e) { details = {}; }
                } else {
                    details = parsed;
                }
            }
        } catch (e) { }

        const isHaSanh = activeTab === 'HA_SANH';
        const isGanViTri = activeTab === 'GAN_VI_TRI';
        const isXuatKho = activeTab === 'XUAT_KHO';

        // Try offline lookup for inbound actions
        const offlineData = (!isXuatKho) ? lookupLot(item.lot_code) : null;

        return (
            <View className="bg-white p-4 rounded-2xl mb-3 border border-zinc-100 shadow-sm flex-row justify-between items-start">
                <View className="flex-row gap-3 flex-1 mr-2">
                    <View className={`w-10 h-10 rounded-full items-center justify-center ${isHaSanh ? 'bg-amber-50' : isGanViTri ? 'bg-blue-50' : 'bg-rose-50'
                        }`}>
                        <Feather
                            name={isHaSanh ? "arrow-down" : isGanViTri ? "arrow-down-left" : "arrow-up-right"}
                            size={20}
                            color={isHaSanh ? "#d97706" : isGanViTri ? "#2563eb" : "#e11d48"}
                        />
                    </View>
                    <View className="flex-1">
                        <Text className="font-black text-zinc-900 text-base">{item.lot_code}</Text>

                        {/* Offline Details for Inbound */}
                        {offlineData && (
                            <View className="mt-0.5">
                                <Text className="text-zinc-800 text-xs font-bold" numberOfLines={2}>{offlineData.productName}</Text>
                                <Text className="text-zinc-400 text-[10px]">{offlineData.productCode}</Text>

                                {/* Tags / Secondary Codes */}
                                {offlineData.tags && offlineData.tags.length > 0 && (
                                    <View className="flex-row flex-wrap gap-1 mt-1">
                                        {offlineData.tags.map((tag: string, tagIdx: number) => {
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
                        )}

                        {isHaSanh && (
                            <Text className="text-zinc-500 text-xs mt-1">
                                {item.position_from || '?'} <Feather name="arrow-right" size={10} /> {item.position_to}
                            </Text>
                        )}
                        {isGanViTri && (
                            <View className="flex-row items-center mt-1.5">
                                <Text className="text-zinc-500 text-xs">Đã gán vào:</Text>
                                <View className="bg-blue-100 px-2 py-0.5 rounded ml-1.5 border border-blue-200">
                                    <Text className="font-bold text-blue-700 text-xs">{item.position_to}</Text>
                                </View>
                            </View>
                        )}
                        {isXuatKho && (
                            <View>
                                {item.product_name && <Text className="text-zinc-800 text-xs font-bold mt-0.5">{item.product_name}</Text>}
                                <Text className="text-zinc-400 text-[10px] mt-0.5">Lý do: {item.reason || '---'}</Text>
                            </View>
                        )}
                    </View>
                </View>

                <View className="items-end">
                    {activeTab === 'XUAT_KHO' ? (
                        <Text className="font-black text-lg text-rose-600">
                            -{item.quantity}
                            {details?.unit ? ` ${details.unit}` : ''}
                        </Text>
                    ) : offlineData ? (
                        <Text className={`font-black text-lg ${isHaSanh ? 'text-amber-600' : 'text-blue-600'}`}>
                            {offlineData.quantity}
                            <Text className="text-xs font-bold text-zinc-500"> {offlineData.unit}</Text>
                        </Text>
                    ) : (
                        <Text className="font-bold text-zinc-400 text-xs uppercase tracking-wider mt-1">{isHaSanh ? 'Moved' : 'Assigned'}</Text>
                    )}

                    <Text className="text-zinc-400 text-[10px] mt-1">{new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
            </View>
        );
    };

    const renderSectionHeader = ({ section: { title } }: { section: { title: string } }) => (
        <View className="bg-zinc-50 py-2 mb-2">
            <Text className="text-zinc-500 font-black text-xs uppercase tracking-widest ml-1">{title}</Text>
        </View>
    );

    return (
        <SafeAreaView className="flex-1 bg-zinc-50" edges={['top']}>
            {/* Header */}
            <View className="px-4 py-4 flex-row items-center justify-between bg-white border-b border-zinc-100">
                <View className="flex-row items-center gap-3">
                    <TouchableOpacity onPress={onBack} className="w-10 h-10 rounded-full bg-zinc-50 border border-zinc-100 items-center justify-center">
                        <Feather name="arrow-left" size={20} color="#52525b" />
                    </TouchableOpacity>
                    <Text className="text-xl font-black text-zinc-900">Lịch Sử</Text>
                </View>

                <View className="flex-row items-center gap-2">
                    <TouchableOpacity onPress={reload} className="w-10 h-10 rounded-xl bg-zinc-50 border border-zinc-100 items-center justify-center">
                        <Feather name="refresh-cw" size={16} color="#52525b" />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setShowDatePicker(true)} className="flex-row items-center bg-zinc-50 px-3 py-2.5 rounded-xl border border-zinc-100">
                        <Feather name="calendar" size={14} color="#52525b" className="mr-2" />
                        <Text className="text-xs font-bold text-zinc-700">
                            {startDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} - {endDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Tabs */}
            <View className="flex-row p-1.5 bg-zinc-200/50 mx-4 mt-4 rounded-xl">
                <TouchableOpacity
                    onPress={() => setActiveTab('HA_SANH')}
                    className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'HA_SANH' ? 'bg-white shadow-sm' : ''}`}
                >
                    <Text className={`font-black text-[10px] uppercase ${activeTab === 'HA_SANH' ? 'text-amber-600' : 'text-zinc-500'}`}>Hạ Sảnh</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setActiveTab('GAN_VI_TRI')}
                    className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'GAN_VI_TRI' ? 'bg-white shadow-sm' : ''}`}
                >
                    <Text className={`font-black text-[10px] uppercase ${activeTab === 'GAN_VI_TRI' ? 'text-blue-600' : 'text-zinc-500'}`}>Gán Vị Trí</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setActiveTab('XUAT_KHO')}
                    className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'XUAT_KHO' ? 'bg-white shadow-sm' : ''}`}
                >
                    <Text className={`font-black text-[10px] uppercase ${activeTab === 'XUAT_KHO' ? 'text-rose-600' : 'text-zinc-500'}`}>Xuất Kho</Text>
                </TouchableOpacity>
            </View>

            {/* Summary Cards */}
            <View className="px-4 mt-4 mb-2">
                {activeTab === 'XUAT_KHO' ? (
                    <View className="bg-zinc-900 rounded-2xl p-4 shadow-lg shadow-zinc-200">
                        <View className="flex-row items-center justify-between mb-4 border-b border-zinc-800 pb-2">
                            <View>
                                <Text className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">Tổng Xuất Kho</Text>
                                <Text className="text-xs text-zinc-500 font-medium">Theo sản phẩm & đơn vị</Text>
                            </View>
                            <View className="w-8 h-8 rounded-full bg-zinc-800 items-center justify-center border border-zinc-700">
                                <Feather name="package" size={16} color="white" />
                            </View>
                        </View>

                        {/* Breakdown List */}
                        <View className="space-y-3">
                            {Object.entries(
                                data.reduce((acc, item) => {
                                    let unit = '';
                                    try {
                                        if (item.details) {
                                            const parsed = JSON.parse(item.details);
                                            const d = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
                                            unit = d.unit || '';
                                        }
                                    } catch (e) { }

                                    const key = `${item.product_name || 'Khác'}__${unit}`;
                                    if (!acc[key]) acc[key] = 0;
                                    acc[key] += item.quantity;
                                    return acc;
                                }, {} as Record<string, number>)
                            ).map(([key, qty], idx) => {
                                const [name, unit] = key.split('__');
                                return (
                                    <View key={idx} className="flex-row justify-between items-center">
                                        <Text className="text-zinc-300 font-bold text-sm flex-1 mr-2" numberOfLines={1}>{name}</Text>
                                        <View className="flex-row items-end">
                                            <Text className="text-xl font-black text-rose-500">{qty.toLocaleString('vi-VN')}</Text>
                                            {unit ? <Text className="text-zinc-500 text-xs font-bold mb-1 ml-1">{unit}</Text> : null}
                                        </View>
                                    </View>
                                );
                            })}
                            {data.length === 0 && <Text className="text-zinc-600 italic text-xs">Chưa có dữ liệu</Text>}
                        </View>
                    </View>
                ) : (
                    <View className="bg-zinc-900 rounded-2xl p-4 shadow-lg shadow-zinc-200 flex-row justify-between items-center">
                        <View>
                            <Text className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-1">
                                {activeTab === 'HA_SANH' ? 'Số Lượng Hạ Sảnh' : 'Số Lượng Gán Vị Trí'}
                            </Text>
                            <View className="flex-row items-end gap-2">
                                <Text className="text-2xl font-black text-white">{summary.count}</Text>
                                <Text className="text-zinc-500 font-bold mb-1 ml-0.5 text-[10px]">lượt</Text>
                            </View>
                        </View>
                        <View className="w-10 h-10 rounded-full bg-zinc-800 items-center justify-center border border-zinc-700">
                            <Feather
                                name={activeTab === 'HA_SANH' ? "arrow-down" : "map-pin"}
                                size={20}
                                color="white"
                            />
                        </View>
                    </View>
                )}
            </View>

            {/* List */}
            <View className="flex-1 px-4 pt-2">
                {loading ? (
                    <ActivityIndicator color="#059669" className="mt-10" />
                ) : (
                    <SectionList
                        sections={sections}
                        keyExtractor={(item, index) => index.toString()}
                        renderItem={renderItem}
                        renderSectionHeader={renderSectionHeader}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 40 }}
                        stickySectionHeadersEnabled={false}
                        ListEmptyComponent={
                            <View className="items-center justify-center mt-10 opacity-50">
                                <Feather name="inbox" size={40} color="#d4d4d8" />
                                <Text className="text-zinc-400 font-bold mt-2">Không có dữ liệu</Text>
                            </View>
                        }
                    />
                )}
            </View>

            {/* Date Picker Modal */}
            <DateRangePicker
                visible={showDatePicker}
                onClose={() => setShowDatePicker(false)}
                onSelect={handleDateSelect}
                initialStartDate={startDate}
                initialEndDate={endDate}
            />
            <StatusBar style="dark" />
        </SafeAreaView>
    );
}
