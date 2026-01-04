import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import clsx from 'clsx';

interface DateRangePickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (start: Date, end: Date) => void;
    initialStartDate?: Date;
    initialEndDate?: Date;
}

const MONTHS = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

export default function DateRangePicker({ visible, onClose, onSelect, initialStartDate, initialEndDate }: DateRangePickerProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [startDate, setStartDate] = useState<Date | undefined>(initialStartDate);
    const [endDate, setEndDate] = useState<Date | undefined>(initialEndDate);

    // Sync props to state when opening
    useEffect(() => {
        if (visible) {
            if (initialStartDate) setCurrentMonth(new Date(initialStartDate));
            setStartDate(initialStartDate);
            setEndDate(initialEndDate);
        }
    }, [visible, initialStartDate, initialEndDate]);

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const generateCalendar = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday

        // Adjust for Monday start if needed (VN typically Mon, but standard Calendar is Sun)
        // Let's use standard Sunday start for simplicity

        const days = [];
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(year, month, i));
        }
        return days;
    };

    const handleDatePress = (date: Date) => {
        // Normalize comparison by stripping time from current selection state if needed
        // But better is to just rely on date objects being comparable.
        // Logic:
        // 1. If start is empty, OR both start/end are set: Start new range.
        // 2. If start is set but end is empty:
        //    - If clicked date < start: Clicked becomes new start.
        //    - Else: Clicked becomes end.

        if (!startDate || (startDate && endDate)) {
            setStartDate(date);
            setEndDate(undefined);
        } else {
            // Compare timestamps to be safe
            if (date.getTime() < startDate.getTime()) {
                setStartDate(date);
            } else {
                setEndDate(date);
            }
        }
    };

    const handleConfirm = () => {
        if (startDate) {
            onSelect(startDate, endDate || startDate);
            onClose();
        }
    };

    const isSelected = (date: Date) => {
        if (!date) return false;
        if (startDate && date.toDateString() === startDate.toDateString()) return true;
        if (endDate && date.toDateString() === endDate.toDateString()) return true;
        return false;
    };

    const isInRange = (date: Date) => {
        if (!date || !startDate || !endDate) return false;
        return date > startDate && date < endDate;
    };

    const changeMonth = (delta: number) => {
        const newDate = new Date(currentMonth);
        newDate.setMonth(newDate.getMonth() + delta);
        setCurrentMonth(newDate);
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View className="flex-1 bg-black/60 justify-center items-center p-4">
                <View className="bg-white w-full max-w-sm rounded-[32px] p-6 overflow-hidden">
                    {/* Header */}
                    <View className="flex-row justify-between items-center mb-6">
                        <TouchableOpacity onPress={() => changeMonth(-1)} className="p-2 bg-zinc-100 rounded-full">
                            <Feather name="chevron-left" size={20} color="#52525b" />
                        </TouchableOpacity>
                        <Text className="font-black text-lg text-zinc-900">
                            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                        </Text>
                        <TouchableOpacity onPress={() => changeMonth(1)} className="p-2 bg-zinc-100 rounded-full">
                            <Feather name="chevron-right" size={20} color="#52525b" />
                        </TouchableOpacity>
                    </View>

                    {/* Week Days */}
                    <View className="flex-row justify-between mb-4 px-1">
                        {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(d => (
                            <Text key={d} className="w-8 text-center text-xs font-bold text-zinc-400">{d}</Text>
                        ))}
                    </View>

                    {/* Calendar Grid */}
                    <View className="flex-row flex-wrap">
                        {generateCalendar().map((date, idx) => {
                            if (!date) return <View key={idx} className="w-[14.28%] h-10" />;

                            const selected = isSelected(date);
                            const inRange = isInRange(date);
                            const isToday = date.toDateString() === new Date().toDateString();

                            return (
                                <TouchableOpacity
                                    key={idx}
                                    className="w-[14.28%] h-10 items-center justify-center relative my-1"
                                    onPress={() => handleDatePress(date)}
                                >
                                    {inRange && (
                                        <View className="absolute h-8 left-0 right-0 bg-amber-100" />
                                    )}
                                    {selected && startDate && (endDate || date.toDateString() !== startDate.toDateString()) && (
                                        <View className={clsx(
                                            "absolute h-8 w-[100%] bg-amber-100",
                                            date.toDateString() === startDate.toDateString() ? "rounded-l-full left-[20%]" : "",
                                            endDate && date.toDateString() === endDate.toDateString() ? "rounded-r-full right-[20%]" : ""
                                        )} />
                                    )}

                                    <View className={clsx(
                                        "w-8 h-8 items-center justify-center rounded-full",
                                        selected ? "bg-amber-500 shadow-md shadow-amber-200" : isToday ? "bg-zinc-100" : ""
                                    )}>
                                        <Text className={clsx(
                                            "text-sm font-medium",
                                            selected ? "text-white font-bold" : isToday ? "text-zinc-900 font-bold" : "text-zinc-700"
                                        )}>
                                            {date.getDate()}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Footer */}
                    <View className="mt-8 flex-row gap-4">
                        <TouchableOpacity onPress={onClose} className="flex-1 py-3 bg-zinc-100 rounded-2xl items-center">
                            <Text className="font-bold text-zinc-500">Hủy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleConfirm} className="flex-1 py-3 bg-zinc-900 rounded-2xl items-center shadow-lg shadow-zinc-200">
                            <Text className="font-bold text-white">Áp dụng</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
