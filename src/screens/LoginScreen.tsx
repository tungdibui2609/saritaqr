import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Image, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { authService } from '../services/auth';

interface LoginScreenProps {
    onLoginSuccess: (user: any) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!username || !password) {
            Alert.alert('Lỗi', 'Vui lòng nhập tài khoản và mật khẩu');
            return;
        }

        setLoading(true);
        try {
            const user = await authService.login(username, password);
            // Alert.alert('Thành công', `Chào mừng ${user.name || user.username}`);
            onLoginSuccess(user);
        } catch (error: any) {
            Alert.alert('Đăng nhập thất bại', error.message || 'Có lỗi xảy ra');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 bg-white"
        >
            <StatusBar style="dark" />
            <ScrollView
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-start', paddingTop: 80, paddingBottom: 0 }}
                className="px-8"
                keyboardShouldPersistTaps="handled"
            >
                <View className="items-center -mb-12">
                    {/* Logo Sarita Only - No Text */}
                    <View className="w-64 h-64 bg-white rounded-full items-center justify-center shadow-2xl shadow-emerald-500/20">
                        <Image
                            source={require('../../assets/logo.png')}
                            style={{ width: 200, height: 200 }}
                            resizeMode="contain"
                        />
                    </View>
                </View>

                <View className="space-y-5">
                    <View>
                        <Text className="text-slate-600 mb-2 font-bold ml-1">Tài khoản</Text>
                        <TextInput
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-lg shadow-sm focus:border-emerald-500 focus:bg-white"
                            placeholder="Nhập tài khoản"
                            placeholderTextColor="#94a3b8"
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                        />
                    </View>


                    <View>
                        <Text className="text-slate-600 mb-2 font-bold ml-1">Mật khẩu</Text>
                        <View className="relative">
                            <TextInput
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-lg shadow-sm focus:border-emerald-500 focus:bg-white pr-12"
                                placeholder="Nhập mật khẩu"
                                placeholderTextColor="#94a3b8"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                            />
                            <TouchableOpacity
                                className="absolute right-4 top-4"
                                onPress={() => setShowPassword(!showPassword)}
                            >
                                <Feather name={showPassword ? "eye" : "eye-off"} size={22} color="#64748b" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <TouchableOpacity
                        className={`w-full bg-emerald-600 py-4 rounded-2xl items-center mt-6 shadow-lg shadow-emerald-500/30 active:bg-emerald-700 ${loading ? 'opacity-70' : ''}`}
                        onPress={handleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text className="text-white font-bold text-lg">Đăng nhập</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View className="mt-12 items-center">
                    <Text className="text-slate-500 font-bold mb-1">Anywarehouse.click</Text>
                    <Text className="text-slate-400 text-xs">© 2025 All Rights Reserved</Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
