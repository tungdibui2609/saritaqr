import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ZoneData } from '../types/warehouse';

export interface OfflineItem {
    position: string;
    productCode: string;
    productName: string;
    unit: string;
    quantity: number;
    lotCode: string;
    tags?: string[];
}

export const useOfflineLookup = () => {
    const [isReady, setIsReady] = useState(false);
    // LotCode -> Position String (e.g. "W1-A-R1-L1-P1")
    const [lotToPos, setLotToPos] = useState<Record<string, string>>({});
    // Position String -> Product Details
    const [posToDetail, setPosToDetail] = useState<Record<string, Omit<OfflineItem, 'lotCode' | 'position'>>>({});

    // Helper to generate multiple key variations for Rack Names
    // e.g. "DÃY A1" -> ["DÃYA1", "A1", "D1"] - heuristics to match "A-K1D1..."
    const getRackVariations = (name: string) => {
        const clean = name.trim().toUpperCase();
        const vars = [clean];
        const noSpaces = clean.replace(/\s+/g, '');
        if (noSpaces !== clean) vars.push(noSpaces);

        // Remove "DÃY" prefix
        if (clean.includes('DÃY')) {
            const stripped = clean.replace('DÃY', '').trim();
            vars.push(stripped); // "A1"
            vars.push(stripped.replace(/\s+/g, '')); // "A1"
        }

        // "D" + Digits Heuristic (Common in VN warehouses: "DÃY A1" -> "D1")
        const digits = clean.replace(/[^0-9]/g, '');
        if (digits) {
            vars.push(`D${digits}`); // "D1"
        }

        return vars;
    };

    const loadIndex = useCallback(async () => {
        try {
            // 1. Load Occupied Map (Position -> LotCode)
            const occupiedRaw = await AsyncStorage.getItem('offline_occupied_locations');
            const occupiedMap = occupiedRaw ? JSON.parse(occupiedRaw) : {};

            const lMap: Record<string, string> = {};
            Object.entries(occupiedMap).forEach(([pos, lot]) => {
                if (typeof lot === 'string') {
                    lMap[lot.trim().toUpperCase()] = pos;
                }
            });
            setLotToPos(lMap);

            // 2. Load Warehouse Status -> Build Position Index
            const pIndex: Record<string, Omit<OfflineItem, 'lotCode' | 'position'>> = {};

            for (const whId of [1, 2, 3]) {
                const whData = await AsyncStorage.getItem(`offline_warehouse_status_${whId}`);
                if (whData) {
                    try {
                        const zones: ZoneData[] = JSON.parse(whData);
                        zones.forEach(zone => {
                            // Racks
                            zone.racks.forEach(rack => {
                                const rackVars = getRackVariations(rack.name);

                                rack.levels.forEach(level => {
                                    level.items.forEach(item => {
                                        const detail = {
                                            productCode: item.code,
                                            productName: item.name,
                                            unit: item.unit,
                                            quantity: parseFloat(item.quantity) || 0,
                                            tags: (item as any).tags || []
                                        };

                                        // Standard Key: W1-A-R1-L1-P1
                                        pIndex[`W${whId}-${zone.id}-${rack.name}-L${level.levelNumber}-P${item.position}`.toUpperCase()] = detail;

                                        // Short Key: 1-A-R1-1-1
                                        pIndex[`${whId}-${zone.id}-${rack.name}-${level.levelNumber}-${item.position}`.toUpperCase()] = detail;

                                        // VN Key: K1-A-D1-T1-P1
                                        pIndex[`K${whId}-${zone.id}-${rack.name}-${level.levelNumber}-${item.position}`.toUpperCase()] = detail;

                                        // Heuristic Keys for "A-K1D1T5.PL6" format
                                        // Try all rack name variations
                                        rackVars.forEach(rName => {
                                            // Variant: "A-K1D1T5.PL6"
                                            // Schema: {Zone}-K{Wh}{Rack}T{Level}.PL{Pos}
                                            const k4 = `${zone.id}-K${whId}${rName}T${level.levelNumber}.PL${item.position}`.toUpperCase();
                                            pIndex[k4] = detail;

                                            // Variant without T/PL?
                                            // Just to be safe: "A-K1-D1-T5-PL6"
                                            const k5 = `${zone.id}-K${whId}-${rName}-T${level.levelNumber}-PL${item.position}`.toUpperCase();
                                            pIndex[k5] = detail;
                                        });
                                    });
                                });
                            });

                            // Hall
                            if (zone.hall && zone.hall.items) {
                                zone.hall.items.forEach(item => {
                                    const detail = {
                                        productCode: item.code,
                                        productName: item.name,
                                        unit: item.unit,
                                        quantity: parseFloat(item.quantity) || 0,
                                        tags: (item as any).tags || []
                                    };

                                    // Standard Hall: W1-A-HALL-P1
                                    pIndex[`W${whId}-${zone.id}-HALL-${item.position}`.toUpperCase()] = detail;

                                    // VN Hall: K1-A-SANH-P1
                                    pIndex[`K${whId}-${zone.id}-SANH-${item.position}`.toUpperCase()] = detail;

                                    // Special Short Hall: S-K1.PL5 (Seen in screenshot)
                                    // Schema: S-K{Wh}.PL{Pos}
                                    const kHall1 = `S-K${whId}.PL${item.position}`.toUpperCase();
                                    pIndex[kHall1] = detail;

                                    // Variation: S-K1-PL5
                                    const kHall2 = `S-K${whId}-PL${item.position}`.toUpperCase();
                                    pIndex[kHall2] = detail;
                                });
                            }
                        });
                    } catch (e) { }
                }
            }

            setPosToDetail(pIndex);
            setIsReady(true);
        } catch (e) {
            console.error("Offline Index Error", e);
        }
    }, []);

    // Now accepts optional knownPosition to bypass Lot Map if we already have the position string (e.g. from history list)
    const lookupLot = (lotCode: string, knownPosition?: string): OfflineItem | null => {
        const normLot = lotCode ? lotCode.trim().toUpperCase() : '';
        const normPosArg = knownPosition ? knownPosition.trim().toUpperCase() : null;

        // 1. Determine Position Key
        // Priority: Known Position > Map Lookup
        let posKey = normPosArg;
        if (!posKey && normLot) {
            posKey = lotToPos[normLot];
        }

        if (posKey) {
            const normPos = posKey.toUpperCase();

            // 2. Look up Details using Position
            const detail = posToDetail[normPos];

            // Debugging Fallback: try removing whitespace from key if exact match failed
            if (!detail) {
                const cleanKey = normPos.replace(/\s+/g, '');
                if (posToDetail[cleanKey]) {
                    return {
                        ...posToDetail[cleanKey],
                        lotCode: normLot,
                        position: posKey
                    };
                }
            }

            if (detail) {
                return {
                    ...detail,
                    lotCode: normLot,
                    position: posKey
                };
            }

            // Return basic info if not found
            return {
                productName: 'Đang tải...',
                productCode: '---',
                lotCode: normLot,
                quantity: 0,
                unit: '-',
                position: posKey,
                tags: []
            };
        }

        return null;
    };

    return {
        isReady,
        lookupLot,
        reload: loadIndex,
        _debugIndex: lotToPos,
        _debugPIndex: posToDetail
    };
};
