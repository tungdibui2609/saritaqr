import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, TouchableWithoutFeedback } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface Option {
    label: string;
    value: string | number;
}

export interface DropdownProps {
    label?: string;
    value: string | number | null;
    options: Option[];
    onSelect: (value: any) => void;
    onClear?: () => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export function Dropdown({
    label,
    value,
    options,
    onSelect,
    onClear,
    placeholder = 'Chọn...',
    disabled = false,
    className
}: DropdownProps) {
    const [visible, setVisible] = useState(false);

    const selectedOption = options.find(o => o.value === value);

    return (
        <View className={twMerge("self-stretch", className)}>
            <TouchableOpacity
                onPress={() => !disabled && setVisible(true)}
                activeOpacity={0.7}
                className={clsx(
                    "w-full flex-row items-center justify-between border rounded-lg px-3 py-2 bg-white",
                    disabled ? "bg-zinc-100 border-zinc-200 opacity-60" : "border-zinc-300",
                    visible && "border-emerald-500 ring-1 ring-emerald-500"
                )}
            >
                <View className="flex-row items-center flex-1 overflow-hidden">
                    {label && <Text className="text-zinc-500 mr-1.5 text-xs font-medium">{label}:</Text>}
                    <Text className={clsx(
                        "text-sm font-medium truncate",
                        selectedOption ? "text-zinc-900" : "text-zinc-400"
                    )} numberOfLines={1}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </Text>
                </View>

                {onClear && value !== null && !disabled ? (
                    <TouchableOpacity onPress={(e) => {
                        e.stopPropagation();
                        onClear();
                    }} className="p-1 -mr-1">
                        <Feather name="x" size={16} color="#ef4444" />
                    </TouchableOpacity>
                ) : (
                    <Feather name="chevron-down" size={16} color={disabled ? "#a1a1aa" : "#52525b"} />
                )}
            </TouchableOpacity>

            <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
                <TouchableWithoutFeedback onPress={() => setVisible(false)}>
                    <View className="flex-1 bg-black/50 justify-center items-center p-4">
                        <TouchableWithoutFeedback>
                            <View className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden max-h-[70%]">
                                <View className="p-4 border-b border-zinc-100 flex-row justify-between items-center bg-zinc-50">
                                    <Text className="font-bold text-zinc-800 text-lg">{label || 'Chọn tùy chọn'}</Text>
                                    <TouchableOpacity onPress={() => setVisible(false)} className="bg-zinc-200 p-1 rounded-full">
                                        <Feather name="x" size={20} color="#52525b" />
                                    </TouchableOpacity>
                                </View>
                                <FlatList
                                    data={options}
                                    keyExtractor={(item) => String(item.value)}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            className={clsx(
                                                "p-4 border-b border-zinc-50 flex-row justify-between items-center active:bg-zinc-50",
                                                item.value === value && "bg-emerald-50"
                                            )}
                                            onPress={() => {
                                                onSelect(item.value);
                                                setVisible(false);
                                            }}
                                        >
                                            <Text className={clsx(
                                                "text-base",
                                                item.value === value ? "font-bold text-emerald-700" : "text-zinc-700"
                                            )}>
                                                {item.label}
                                            </Text>
                                            {item.value === value && (
                                                <Feather name="check" size={18} color="#047857" />
                                            )}
                                        </TouchableOpacity>
                                    )}
                                />
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
}
