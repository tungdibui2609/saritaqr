import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { warehouseApi } from '../../api/client';
import clsx from 'clsx';

interface ColorTheme {
    base: string;
    text: string;
    light: string;
    border: string;
}

// Expanded Palette
const PALETTE: ColorTheme[] = [
    { base: '#ef4444', text: '#b91c1c', light: '#fef2f2', border: '#fecaca' }, // Red
    { base: '#f97316', text: '#c2410c', light: '#fff7ed', border: '#fed7aa' }, // Orange
    { base: '#f59e0b', text: '#b45309', light: '#fffbeb', border: '#fde68a' }, // Amber
    { base: '#eab308', text: '#a16207', light: '#fefce8', border: '#fef08a' }, // Yellow
    { base: '#84cc16', text: '#4d7c0f', light: '#f7fee7', border: '#d9f99d' }, // Lime
    { base: '#22c55e', text: '#15803d', light: '#f0fdf4', border: '#bbf7d0' }, // Green
    { base: '#10b981', text: '#047857', light: '#ecfdf5', border: '#99f6e4' }, // Emerald
    { base: '#14b8a6', text: '#0f766e', light: '#f0fdfa', border: '#ccfbf1' }, // Teal
    { base: '#06b6d4', text: '#0e7490', light: '#ecfeff', border: '#a5f3fc' }, // Cyan
    { base: '#0ea5e9', text: '#0369a1', light: '#f0f9ff', border: '#bae6fd' }, // Sky
    { base: '#3b82f6', text: '#1d4ed8', light: '#eff6ff', border: '#bfdbfe' }, // Blue
    { base: '#6366f1', text: '#4338ca', light: '#eef2ff', border: '#c7d2fe' }, // Indigo
    { base: '#8b5cf6', text: '#6d28d9', light: '#f5f3ff', border: '#ddd6fe' }, // Violet
    { base: '#a855f7', text: '#7e22ce', light: '#faf5ff', border: '#e9d5ff' }, // Purple
    { base: '#d946ef', text: '#a21caf', light: '#fdf4ff', border: '#f0abfc' }, // Fuchsia
    { base: '#ec4899', text: '#be185d', light: '#fdf2f8', border: '#fbcfe8' }, // Pink
    { base: '#f43f5e', text: '#be123c', light: '#fff1f2', border: '#fda4af' }, // Rose
    { base: '#64748b', text: '#334155', light: '#f8fafc', border: '#cbd5e1' }, // Slate
    { base: '#71717a', text: '#3f3f46', light: '#fafafa', border: '#e4e4e7' }, // Zinc
    { base: '#78716c', text: '#44403c', light: '#fafaf9', border: '#e7e5e4' }, // Stone
];

export default function ColorSettingsView() {
    const [productCodes, setProductCodes] = useState<string[]>([]);
    const [customColors, setCustomColors] = useState<Record<string, ColorTheme>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
    const [newCode, setNewCode] = useState('');

    // Initial Load
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // 1. Get saved custom colors first
            const saved = await AsyncStorage.getItem('custom_product_colors');
            let savedColors = {};
            if (saved) {
                savedColors = JSON.parse(saved);
                setCustomColors(savedColors);
            }

            // 2. Get existing codes from API
            const apiColors = await warehouseApi.getColors();
            let codes = apiColors && typeof apiColors === 'object' ? Object.keys(apiColors) : [];

            // 3. Merge API codes with Custom codes (so manually added ones appear)
            const allCodes = new Set([...codes, ...Object.keys(savedColors)]);
            setProductCodes(Array.from(allCodes).sort());

        } catch (error) {
            console.error(error);
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

    const handleAddCode = () => {
        if (!newCode.trim()) return;
        const code = newCode.trim().toUpperCase();

        if (productCodes.includes(code)) {
            Alert.alert("Thông báo", "Mã sản phẩm này đã có trong danh sách");
            return;
        }

        setProductCodes(prev => [code, ...prev].sort());
        setNewCode('');
        Alert.alert("Thành công", `Đã thêm mã ${code}. Hãy chọn màu cho nó.`);

        // Auto open selection for convenience
        setTimeout(() => setSelectedProduct(code), 500);
    };

    if (isLoading) {
        return (
            <View className="p-8 justify-center items-center">
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text className="text-zinc-400 mt-2">Đang tải danh sách...</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
        >
            <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Add New Code Section */}
                <View className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm mb-4">
                    <Text className="font-bold text-sm text-zinc-900 mb-2">Thêm mã sản phẩm mới</Text>
                    <View className="flex-row gap-2">
                        <TextInput
                            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900"
                            placeholder="Nhập mã (VD: SP-MOI)"
                            value={newCode}
                            onChangeText={setNewCode}
                            autoCapitalize="characters"
                        />
                        <TouchableOpacity
                            onPress={handleAddCode}
                            className="bg-blue-600 px-4 py-2 rounded-lg justify-center items-center"
                        >
                            <Text className="text-white font-bold">Thêm</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View className="bg-blue-50 p-3 rounded-lg mb-4 border border-blue-100">
                    <Text className="text-blue-700 text-xs">
                        Chọn màu hiển thị cho các mã sản phẩm. Những mã không được chọn sẽ dùng màu mặc định của hệ thống.
                    </Text>
                </View>

                <View className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                    {productCodes.map((code, index) => {
                        const isSelected = selectedProduct === code;
                        const currentTheme = customColors[code];

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
                                        <View>
                                            <Text className="font-bold text-zinc-700 text-base">{code}</Text>
                                            {!currentTheme && <Text className="text-[10px] text-zinc-400">Mặc định</Text>}
                                        </View>
                                    </View>

                                    <View className="flex-row items-center gap-2">
                                        {currentTheme && (
                                            <View className="bg-blue-100 px-2 py-0.5 rounded">
                                                <Text className="text-[10px] text-blue-700 font-bold">Đã chọn</Text>
                                            </View>
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
                                        <Text className="text-center text-xs text-zinc-400 mt-2">Nhấn Reset để dùng màu mặc định</Text>
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
