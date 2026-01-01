import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ZoneData } from '../../types/warehouse';
import clsx from 'clsx';

interface ZoneStatProps {
    name: string;
    total: number;
    used: number;
    color: 'blue' | 'emerald' | 'amber';
}

function ZoneStatCard({ name, total, used, color }: ZoneStatProps) {
    const empty = Math.max(0, total - used);
    const percent = total > 0 ? Math.round((used / total) * 100) : 0;

    const colorStyles = {
        blue: 'bg-blue-50 border-blue-100',
        emerald: 'bg-emerald-50 border-emerald-100',
        amber: 'bg-amber-50 border-amber-100',
    };

    const textStyles = {
        blue: 'text-blue-600',
        emerald: 'text-emerald-600',
        amber: 'text-amber-600',
    };

    return (
        <View className={clsx("p-3 rounded-xl border mb-3", colorStyles[color])}>
            <View className="flex-row justify-between items-center mb-2">
                <View className="flex-row items-center gap-2">
                    <MaterialCommunityIcons name="warehouse" size={18} className={textStyles[color]} color={color === 'blue' ? '#2563eb' : color === 'emerald' ? '#059669' : '#d97706'} />
                    <Text className={clsx("font-bold text-base", textStyles[color])}>
                        {name}
                    </Text>
                </View>
                <View className="bg-white/50 px-2 py-1 rounded-full">
                    <Text className={clsx("text-xs font-bold", textStyles[color])}>
                        {percent}% Đầy
                    </Text>
                </View>
            </View>

            <View className="flex-row gap-2">
                <View className="flex-1 bg-white/60 p-2 rounded-lg items-center">
                    <Text className="text-xs text-zinc-500 mb-1">Tổng</Text>
                    <Text className="font-bold text-lg text-zinc-800">{total}</Text>
                </View>
                <View className="flex-1 bg-white/60 p-2 rounded-lg items-center">
                    <Text className="text-xs text-zinc-500 mb-1">Đã dùng</Text>
                    <Text className="font-bold text-lg text-zinc-800">{used}</Text>
                </View>
                <View className="flex-1 bg-white p-2 rounded-lg border-2 border-zinc-100 items-center shadow-sm">
                    <Text className="text-xs font-bold uppercase text-zinc-400 mb-1">Trống</Text>
                    <Text className="font-bold text-xl text-zinc-900">{empty}</Text>
                </View>
            </View>
        </View>
    );
}

interface WarehouseStatsProps {
    zones: ZoneData[];
    isLoading?: boolean;
}

export default function WarehouseStats({ zones, isLoading }: WarehouseStatsProps) {
    const stats = useMemo(() => {
        // Calculate Zone A
        const zoneA = zones.find(z => z.id === 'A');
        let totalA = 0;
        let usedA = 0;
        if (zoneA) {
            zoneA.racks.forEach(r => {
                r.levels.forEach(l => {
                    totalA += l.total;
                    usedA += l.used;
                });
            });
        }

        // Calculate Zone B (excluding Hall)
        const zoneB = zones.find(z => z.id === 'B');
        let totalB = 0;
        let usedB = 0;
        if (zoneB) {
            zoneB.racks.forEach(r => {
                r.levels.forEach(l => {
                    totalB += l.total;
                    usedB += l.used;
                });
            });
        }

        // Calculate Hall (from Zone B metadata)
        let totalHall = 0;
        let usedHall = 0;
        if (zoneB?.hall) {
            totalHall = zoneB.hall.total;
            usedHall = zoneB.hall.used;
        }

        return [
            {
                name: "Khu A",
                total: totalA,
                used: usedA,
                color: 'blue' as const
            },
            {
                name: "Khu B",
                total: totalB,
                used: usedB,
                color: 'emerald' as const
            },
            {
                name: "Sảnh (Hall)",
                total: totalHall,
                used: usedHall,
                color: 'amber' as const
            }
        ];
    }, [zones]);

    if (isLoading && zones.length === 0) {
        return (
            <View className="mb-4">
                {[1, 2, 3].map(i => (
                    <View key={i} className="h-32 bg-zinc-100 rounded-xl mb-3" />
                ))}
            </View>
        );
    }

    return (
        <View className="mb-4">
            {stats.map((stat, index) => (
                <ZoneStatCard key={index} {...stat} />
            ))}
        </View>
    );
}
