import React from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';

export const AppFooter = () => {
    const handleLinkPress = () => {
        Linking.openURL('https://anywarehouse.click').catch(err => console.error("Couldn't load page", err));
    };

    return (
        <View className="py-8 items-center justify-center opacity-50 space-y-1">
            <Text className="text-xs font-bold text-zinc-400">SaritaQr V.2.2.1</Text>
            <TouchableOpacity onPress={handleLinkPress}>
                <Text className="text-[10px] font-medium text-zinc-400">
                    Developed by <Text className="text-[#8B4513] font-bold underline">Anywarehouse System</Text>
                </Text>
            </TouchableOpacity>
        </View>
    );
};
