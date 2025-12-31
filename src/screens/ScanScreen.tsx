import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Vibration } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { database } from '../database/db';
import { StatusBar } from 'expo-status-bar';

export default function ScanScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [lastCode, setLastCode] = useState<string | null>(null);

    if (!permission) {
        // Camera permissions are still loading.
        return <View />;
    }

    if (!permission.granted) {
        // Camera permissions are not granted yet.
        return (
            <View className="flex-1 justify-center items-center bg-amber-900 p-6">
                <Text className="text-amber-100 text-center mb-4 text-lg">Cần quyền truy cập Camera để quét mã</Text>
                <TouchableOpacity
                    className="bg-amber-500 px-6 py-3 rounded-xl"
                    onPress={requestPermission}
                >
                    <Text className="text-amber-950 font-bold">Cấp quyền Camera</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
        if (scanned) return;
        setScanned(true);
        Vibration.vibrate();

        // Logic: Save to DB immediately
        try {
            // Default quantity 1 for now, user can edit later if needed or we assume standard pack
            const insertedId = database.addScan(data, 1);
            setLastCode(data);

            Alert.alert(
                'Đã quét!',
                `Mã: ${data}\nĐã lưu vào bộ nhớ tạm.`,
                [
                    {
                        text: 'Tiếp tục quét',
                        onPress: () => setScanned(false)
                    }
                ]
            );
        } catch (e) {
            Alert.alert('Lỗi', 'Không thể lưu mã quét');
            setScanned(false);
        }
    };

    return (
        <View className="flex-1 bg-black">
            <StatusBar style="light" />
            <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />

            {/* Overlay UI */}
            <View className="flex-1 justify-between py-12 px-6">
                <View className="items-center">
                    <Text className="text-white text-lg font-bold bg-black/50 px-4 py-2 rounded-full">
                        {scanned ? 'Đang xử lý...' : 'Di chuyển camera vào mã QR'}
                    </Text>
                </View>

                {/* Framing Box Area */}
                <View className="flex-1 items-center justify-center">
                    <View className="w-64 h-64 border-2 border-amber-400 rounded-lg bg-transparent opacity-50" />
                </View>

                <View className="items-center">
                    {lastCode && (
                        <View className="bg-black/70 p-4 rounded-xl border border-white/20">
                            <Text className="text-amber-400 text-sm">Vừa quét:</Text>
                            <Text className="text-white font-bold text-xl">{lastCode}</Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
}
