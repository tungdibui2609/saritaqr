import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { database, ScannedLot } from '../database/db';
import { syncService } from '../services/sync';

export default function HistoryScreen({ onBack }: { onBack: () => void }) {
    const [history, setHistory] = useState<ScannedLot[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const loadHistory = useCallback(() => {
        setLoading(true);
        try {
            // @ts-ignore - getAllScans added recently
            const data = database.getAllScans();
            setHistory(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    const handleSync = async () => {
        const pending = history.filter(h => h.synced === 0);
        if (pending.length === 0) {
            Alert.alert('Thông báo', 'Không có dữ liệu mới để đồng bộ.');
            return;
        }

        setSyncing(true);
        try {
            const result = await syncService.syncData(pending);
            if (result.success) {
                Alert.alert('Thành công', `Đã đồng bộ ${result.count} mục.`);
                loadHistory(); // Reload to show synced status
            } else {
                Alert.alert('Lỗi', 'Đồng bộ thất bại. Vui lòng thử lại.');
            }
        } catch (e: any) {
            Alert.alert('Lỗi', e.message || 'Lỗi kết nối');
        } finally {
            setSyncing(false);
        }
    };

    const handleDelete = (id: number) => {
        Alert.alert(
            'Xóa',
            'Bạn có chắc muốn xóa mục này?',
            [
                { text: 'Hủy', style: 'cancel' },
                {
                    text: 'Xóa',
                    style: 'destructive',
                    onPress: () => {
                        database.deleteScan(id);
                        loadHistory();
                    }
                }
            ]
        );
    };

    const renderItem = ({ item }: { item: ScannedLot }) => (
        <View className={`p-4 mb-2 rounded-xl border ${item.synced ? 'bg-green-50/50 border-green-200' : 'bg-white border-amber-200 shadow-sm'}`}>
            <View className="flex-row justify-between items-center">
                <View>
                    <Text className="font-bold text-lg text-amber-950">{item.code}</Text>
                    <Text className="text-gray-500 text-xs">{new Date(item.timestamp).toLocaleString('vi-VN')}</Text>
                </View>
                <View className="items-end">
                    <Text className="font-bold text-amber-600 mb-1">SL: {item.quantity}</Text>
                    {item.synced ? (
                        <Text className="text-green-600 text-xs font-medium">✓ Đã đồng bộ</Text>
                    ) : (
                        <Text className="text-amber-600 text-xs font-medium">☁ Chưa gửi</Text>
                    )}
                </View>
            </View>
            {!item.synced && (
                <TouchableOpacity
                    className="mt-2 self-end bg-red-100 px-3 py-1 rounded"
                    onPress={() => handleDelete(item.id)}
                >
                    <Text className="text-red-600 text-xs">Xóa</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <View className="flex-1 bg-amber-50">
            <View className="bg-amber-900 pt-12 pb-4 px-4 flex-row justify-between items-center rounded-b-2xl shadow-md">
                <TouchableOpacity onPress={onBack} className="p-2">
                    <Text className="text-white font-bold text-lg">← Quay lại</Text>
                </TouchableOpacity>
                <Text className="text-white font-bold text-xl">Lịch Sử Quét</Text>
                <View className="w-20" />
            </View>

            <View className="flex-1 px-4 py-4">
                {loading ? (
                    <ActivityIndicator color="#d97706" />
                ) : (
                    <FlatList
                        data={history}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={renderItem}
                        ListEmptyComponent={<Text className="text-center text-gray-500 mt-10">Chưa có dữ liệu quét nào</Text>}
                    />
                )}
            </View>

            <View className="p-4 bg-white border-t border-amber-100">
                <TouchableOpacity
                    className={`w-full py-4 rounded-xl items-center ${syncing ? 'bg-gray-400' : 'bg-green-600'}`}
                    onPress={handleSync}
                    disabled={syncing}
                >
                    {syncing ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text className="text-white font-bold text-lg">ĐỒNG BỘ MÁY CHỦ ({history.filter(h => !h.synced).length})</Text>
                    )}
                </TouchableOpacity>
            </View>
            <StatusBar style="light" />
        </View>
    );
}
