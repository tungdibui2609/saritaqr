import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { warehouseApi } from '../../api/client';
import clsx from 'clsx';

interface ColorSettingsModalProps {
    visible: boolean;
    onClose: () => void;
}

interface ColorTheme {
    base: string;
    text: string;
    light: string;
    border: string;
}

// Same Palette as SmartRackList
const PALETTE: ColorTheme[] = [
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

export default function ColorSettingsModal({ visible, onClose }: ColorSettingsModalProps) {
    const [productCodes, setProductCodes] = useState<string[]>([]);
    const [customColors, setCustomColors] = useState<Record<string, ColorTheme>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

    // Initial Load
    useEffect(() => {
        if (visible) {
            loadData();
        }
    }, [visible]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // 1. Get existing codes from API
            const apiColors = await warehouseApi.getColors();
            const codes = apiColors && typeof apiColors === 'object' ? Object.keys(apiColors) : [];
            setProductCodes(codes.sort());

            // 2. Get saved custom colors
            const saved = await AsyncStorage.getItem('custom_product_colors');
            if (saved) {
                setCustomColors(JSON.parse(saved));
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Lỗi', 'Không thể tải dữ liệu cấu hình');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectColor = async (product: string, theme: ColorTheme) => {
        const newColors = { ...customColors, [product]: theme };
        setCustomColors(newColors);
        setSelectedProduct(null); // Close selection
        await AsyncStorage.setItem('custom_product_colors', JSON.stringify(newColors));
    };

    const handleReset = async (product: string) => {
        const newColors = { ...customColors };
        delete newColors[product];
        setCustomColors(newColors);
        setSelectedProduct(null);
        await AsyncStorage.setItem('custom_product_colors', JSON.stringify(newColors));
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            onRequestClose={onClose}
            presentationStyle="pageSheet"
        >
            <View className="flex-1 bg-zinc-50">
                {/* Header */}
                <View className="bg-white px-4 py-3 border-b border-zinc-200 flex-row justify-between items-center">
                    <Text className="text-lg font-bold text-zinc-900">Cấu hình màu sắc</Text>
                    <TouchableOpacity onPress={onClose} className="p-2 bg-zinc-100 rounded-full">
                        <Feather name="x" size={24} color="#52525b" />
                    </TouchableOpacity>
                </View>

                {isLoading ? (
                    <View className="flex-1 justify-center items-center">
                        <ActivityIndicator size="large" color="#3b82f6" />
                    </View>
                ) : (
                    <ScrollView className="flex-1 p-4">
                        <Text className="text-zinc-500 mb-4 text-sm">
                            Chọn màu hiển thị cho các mã sản phẩm. Những mã không được chọn sẽ dùng màu mặc định của hệ thống.
                        </Text>

                        <View className="bg-white rounded-xl border border-zinc-200 overflow-hidden mb-8">
                            {productCodes.map((code, index) => {
                                const isSelected = selectedProduct === code;
                                const currentTheme = customColors[code]; // If undefined, will appear 'default' in UI logic below

                                return (
                                    <View key={code} className={clsx("border-b border-zinc-100", index === productCodes.length - 1 && "border-b-0")}>
                                        <TouchableOpacity
                                            className="p-4 flex-row justify-between items-center bg-white active:bg-zinc-50"
                                            onPress={() => setSelectedProduct(isSelected ? null : code)}
                                        >
                                            <View className="flex-row items-center gap-3">
                                                {/* Color Preview */}
                                                <View
                                                    className="w-8 h-8 rounded-lg border border-zinc-200 items-center justify-center"
                                                    style={{ backgroundColor: currentTheme?.base || '#e4e4e7' }}
                                                >
                                                    {!currentTheme && <Text className="text-[10px] text-zinc-400">Auto</Text>}
                                                </View>
                                                <Text className="font-bold text-zinc-700 text-base">{code}</Text>
                                            </View>

                                            <View className="flex-row items-center gap-2">
                                                {currentTheme ? (
                                                    <Text className="text-xs text-blue-600 font-medium">Đã chọn</Text>
                                                ) : (
                                                    <Text className="text-xs text-zinc-400">Mặc định</Text>
                                                )}
                                                <Feather name={isSelected ? "chevron-up" : "chevron-down"} size={20} color="#a1a1aa" />
                                            </View>
                                        </TouchableOpacity>

                                        {/* Color Picker Drawer */}
                                        {isSelected && (
                                            <View className="p-4 bg-zinc-50 border-t border-zinc-100">
                                                <View className="flex-row flex-wrap gap-3 justify-center">
                                                    {PALETTE.map((theme, i) => (
                                                        <TouchableOpacity
                                                            key={i}
                                                            onPress={() => handleSelectColor(code, theme)}
                                                            className="w-10 h-10 rounded-full shadow-sm border-2 border-white"
                                                            style={{ backgroundColor: theme.base }}
                                                        />
                                                    ))}
                                                    <TouchableOpacity
                                                        onPress={() => handleReset(code)}
                                                        className="w-10 h-10 rounded-full border-2 border-zinc-300 bg-white items-center justify-center"
                                                    >
                                                        <Feather name="rotate-ccw" size={16} color="#71717a" />
                                                    </TouchableOpacity>
                                                </View>
                                                <Text className="text-center text-xs text-zinc-400 mt-2">Chọn màu hoặc nhấn Reset để dùng mặc định</Text>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </ScrollView>
                )}
            </View>
        </Modal>
    );
}
