import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { authService } from '../services/auth';
import ColorSettingsView from '../components/settings/ColorSettingsView';
import clsx from 'clsx';

interface SettingsScreenProps {
    onLogout: () => void;
}

export default function SettingsScreen({ onLogout }: SettingsScreenProps) {
    const [activeTab, setActiveTab] = useState<'data' | 'color'>('data');

    // Data Stats State
    const [locationsCount, setLocationsCount] = useState(0);
    const [occupiedCount, setOccupiedCount] = useState(0);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        loadSettings();
        authService.getUser().then(setUser);
    }, []);

    const loadSettings = async () => {
        try {
            const locs = await AsyncStorage.getItem('offline_static_locations');
            const occ = await AsyncStorage.getItem('offline_occupied_locations');
            const updated = await AsyncStorage.getItem('offline_data_last_updated');

            if (locs) setLocationsCount(JSON.parse(locs).length);
            if (occ) setOccupiedCount(Object.keys(JSON.parse(occ)).length);
            if (updated) setLastUpdated(new Date(parseInt(updated)).toLocaleString('vi-VN'));
        } catch (e) {
            console.error(e);
        }
    };

    const handleDownloadData = async () => {
        setIsDownloading(true);
        try {
            // 1. Fetch Locations
            const locRes = await client.get('/scanner/locations');
            if (locRes.data.ok) {
                await AsyncStorage.setItem('offline_static_locations', JSON.stringify(locRes.data.locations));
                setLocationsCount(locRes.data.locations.length);
            }

            // 2. Fetch Occupied
            const occRes = await client.get('/scanner/occupied');
            if (occRes.data.ok) {
                await AsyncStorage.setItem('offline_occupied_locations', JSON.stringify(occRes.data.occupied));
                setOccupiedCount(Object.keys(occRes.data.occupied).length);
            }

            const now = Date.now().toString();
            await AsyncStorage.setItem('offline_data_last_updated', now);
            setLastUpdated(new Date(parseInt(now)).toLocaleString('vi-VN'));

            Alert.alert("Thành công", "Đã cập nhật dữ liệu mới nhất từ máy chủ!");
        } catch (error) {
            Alert.alert("Lỗi", "Không thể tải dữ liệu. Vui lòng kiểm tra kết nối mạng.");
            console.error(error);
        } finally {
            setIsDownloading(false);
        }
    };

    const renderDataTab = () => (
        <ScrollView className="p-4 space-y-4">
            {/* Data Section */}
            <View className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                <View className="flex-row justify-between items-center mb-4">
                    <Text className="text-sm font-medium text-zinc-500">Dữ liệu offline</Text>
                    <Text className="text-xs text-zinc-400">{lastUpdated || 'Chưa có dữ liệu'}</Text>
                </View>

                <View className="flex-row gap-4 mb-4">
                    <View className="flex-1 bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                        <Text className="text-2xl font-bold text-zinc-700">{locationsCount}</Text>
                        <Text className="text-xs text-zinc-400">Vị trí</Text>
                    </View>
                    <View className="flex-1 bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                        <Text className="text-2xl font-bold text-zinc-700">{occupiedCount}</Text>
                        <Text className="text-xs text-zinc-400">Đang chứa hàng</Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={handleDownloadData}
                    disabled={isDownloading}
                    className={`w-full py-3 rounded-lg flex-row justify-center items-center gap-2 ${isDownloading ? 'bg-zinc-100' : 'bg-blue-50'}`}
                >
                    {isDownloading ? (
                        <ActivityIndicator size="small" color="#3b82f6" />
                    ) : (
                        <Feather name="download-cloud" size={18} color="#2563eb" />
                    )}
                    <Text className={`font-medium ${isDownloading ? 'text-zinc-400' : 'text-blue-600'}`}>
                        {isDownloading ? "Đang tải về..." : "Cập nhật dữ liệu ngay"}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* User Info */}
            <View className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm space-y-3">
                <Text className="font-bold text-sm text-zinc-900">Tài khoản</Text>
                <View className="flex-row justify-between">
                    <Text className="text-zinc-500">Tên đăng nhập</Text>
                    <Text className="font-medium text-zinc-900">{user?.username || '---'}</Text>
                </View>

                <TouchableOpacity
                    onPress={onLogout}
                    className="w-full py-3 bg-rose-50 rounded-xl mt-2 border border-rose-100 items-center"
                >
                    <Text className="text-rose-600 font-medium">Đăng xuất</Text>
                </TouchableOpacity>
            </View>

            <View className="items-center mt-8">
                <Text className="text-xs text-zinc-300">QLK Mobile v1.0.1</Text>
            </View>
        </ScrollView>
    );

    return (
        <View className="flex-1 bg-zinc-50">
            <View className="bg-white border-b border-zinc-200">
                <View className="p-4">
                    <Text className="text-lg font-bold text-zinc-900">Cài Đặt</Text>
                </View>

                {/* Tabs */}
                <View className="flex-row px-4">
                    <TouchableOpacity
                        onPress={() => setActiveTab('data')}
                        className={clsx(
                            "mr-6 pb-3 border-b-2",
                            activeTab === 'data' ? "border-zinc-900" : "border-transparent"
                        )}
                    >
                        <Text className={clsx(
                            "font-bold text-sm",
                            activeTab === 'data' ? "text-zinc-900" : "text-zinc-400"
                        )}>Dữ liệu</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setActiveTab('color')}
                        className={clsx(
                            "mr-6 pb-3 border-b-2",
                            activeTab === 'color' ? "border-zinc-900" : "border-transparent"
                        )}
                    >
                        <Text className={clsx(
                            "font-bold text-sm",
                            activeTab === 'color' ? "text-zinc-900" : "text-zinc-400"
                        )}>Màu sắc</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View className="flex-1">
                {activeTab === 'data' ? renderDataTab() : <ColorSettingsView />}
            </View>
        </View>
    );
}
