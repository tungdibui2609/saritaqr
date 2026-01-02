import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ZoneData, LevelData } from '../types/warehouse';

export interface OfflineItem {
    position: string;
    productCode: string;
    productName: string; // Likely same as productCode or derived
    unit: string;
    quantity: number;
    lotCode: string;
}

export const useOfflineLookup = () => {
    const [isReady, setIsReady] = useState(false);
    // LotCode -> Position
    const [lotToPos, setLotToPos] = useState<Record<string, string>>({});
    // Position -> Product Details
    const [posToDetail, setPosToDetail] = useState<Record<string, Omit<OfflineItem, 'lotCode' | 'position'>>>({});

    const normalizePos = (p: string) => p.toUpperCase().replace(/\s+/g, ''); // "W1-A-..." canonical

    const loadIndex = useCallback(async () => {
        try {
            // 1. Load Occupied Map (Position -> LotCode)
            // Example key: "W1-A-R1-L1-P1" or "S-1-1"
            const occupiedRaw = await AsyncStorage.getItem('offline_occupied_locations');
            const occupiedMap = occupiedRaw ? JSON.parse(occupiedRaw) : {};

            const lIndex: Record<string, string> = {};
            Object.entries(occupiedMap).forEach(([pos, lot]) => {
                if (typeof lot === 'string') {
                    // Store normalized Lot -> Position
                    lIndex[lot.trim().toUpperCase()] = pos;
                }
            });
            setLotToPos(lIndex);

            // 2. Load Warehouse Status (1, 2, 3) -> Build Position Index
            const pIndex: Record<string, Omit<OfflineItem, 'lotCode' | 'position'>> = {};

            for (const whId of [1, 2, 3]) {
                const whData = await AsyncStorage.getItem(`offline_warehouse_status_${whId}`);
                if (whData) {
                    const zones: ZoneData[] = JSON.parse(whData);
                    zones.forEach(zone => {
                        // RACK Processing
                        zone.racks.forEach(rack => {
                            rack.levels.forEach(level => {
                                level.items.forEach(item => {
                                    // item.position is just index (1, 2...). 
                                    // We need to construct the full string "W{whId}-{zone}-{rackName}-L{level}-P{pos}"?
                                    // Let's use flexible matching or try to construct standard keys.
                                    // Standard key in SARITA seems to be: 
                                    // "W1-A-R1-L1-P1" -> "K1-A-D1-T1-??" 
                                    // In `AssignScreen`, keys are checked via `checkToken`.
                                    // Let's assume standard keys: 
                                    // Helper to generate keys:
                                    const keys: string[] = [];

                                    // Try common formats used in the system
                                    // Format 1: A-R1-L1-P1 (Generic) - usually prefixed with W{id}.
                                    // Format 2: "K{id}-{Zone}-D{RackIndex}-T{Level}-{Pos}"?
                                    // Let's just create a unique key based on hierarchy and try to match vaguely if needed.
                                    // Actually, we can just look at `occupiedMap` keys to guess the format!
                                    // But we don't have access to runtime values here.
                                    // However, `SmartRackList` seems to render them simply.

                                    // Let's store by a constructed Signature: `${whId}-${zone.id}-${rack.name}-${level.levelNumber}-${item.position}`
                                    // And we will normalize lookup queries to match.
                                    // But `occupiedMap` keys come from Server.
                                    // We must rely on `lotToPos` providing a position string that we can parse.

                                    // Better Strategy:
                                    // Store `posToDetail` using a very specific signature.
                                    // When `lookupLot` is called:
                                    // 1. Get `posString` from `lotToPos`.
                                    // 2. Parse `posString` to extract Wh, Zone, Rack, Level, Pos.
                                    // 3. Reconstruct Signature and look up in `posToDetail`.

                                    const sig = `${whId}-${zone.id}-${rack.name}-${level.levelNumber}-${item.position}`.toUpperCase();

                                    pIndex[sig] = {
                                        productCode: item.code,
                                        productName: item.name,
                                        unit: item.unit,
                                        quantity: parseFloat(item.quantity) || 0
                                    };
                                });
                            });
                        });

                        // HALL Processing
                        if (zone.hall && zone.hall.items) {
                            zone.hall.items.forEach(item => {
                                // Hall Position Signature
                                // Usually "S-1-1" or "S-01-01"?
                                // Let's store rigid signature: `${whId}-S-${item.position}`
                                // Wait, Hall doesn't usually have Rack/Level. Just linear position.
                                // zone.id is likely 'S' or 'B'.
                                const sig = `${whId}-${zone.id}-HALL-${item.position}`.toUpperCase();
                                pIndex[sig] = {
                                    productCode: item.code,
                                    productName: item.name,
                                    unit: item.unit,
                                    quantity: parseFloat(item.quantity) || 0
                                };
                            });
                        }
                    });
                }
            }
            setPosToDetail(pIndex);
            setIsReady(true);
        } catch (e) {
            console.error("Offline Index Error", e);
        }
    }, []);

    useEffect(() => {
        loadIndex();
    }, [loadIndex]);

    const lookupLot = (lotCode: string): OfflineItem | null => {
        const normLot = lotCode.trim().toUpperCase();
        const posString = lotToPos[normLot];
        if (!posString) return null; // Lot not commonly occupied

        // Parse posString to match our Signature
        // Supported Keys usually: "W1-A-D1-T1-P1" or "K1-A-D1-T1-P1" or "S-1-1"
        const upperPos = posString.toUpperCase().replace(/\./g, '-');

        let sig = "";

        // HALL Detection
        // "S-01-05" -> Wh?, Zone=S?, Pos=??
        // If starts with S-, it is Hall. But which warehouse?
        // Usually global S? Or per warehouse?
        // WorkScreen says: `targetWarehouse: 'AUTO'`.
        // Let's try to parse liberally.

        // REGEX PARSING
        // Group 1: Wh (K1, W1, 1), Group 2: Zone (A, B, S), Group 3: Rack (D1, R1), Group 4: Level, Group 5: Pos
        // Example: "K1-A-D1-T1-P1"
        const match = upperPos.match(/(?:(?:KHO|K|W)?(\d+)[^A-Z0-9]*)?([ABS])(?:[^A-Z0-9]*(?:D|R|DAY)?(\d+))?(?:[^A-Z0-9]*(?:T|L|TANG)?(\d+))?(?:[^A-Z0-9]*(?:P|VT)?(\d+))/);

        if (match) {
            const w = match[1] ? parseInt(match[1]) : 1; // Default to 1 if missing?
            const z = match[2];
            const r = match[3] || "0"; // Rack Name (usually number)
            const l = match[4] || "0";
            const p = match[5] ? parseInt(match[5]) : 0;

            if (z === 'S' || z === 'B' && !match[3]) {
                // Hall logic: `${whId}-${zone.id}-HALL-${item.position}`
                // If match has no Rack, assume Hall?
                // S-1-5 -> Wh=1 (implied), Z=S, P=...
                // Actually Hall keys might be simple "S-1-5" -> Wh1-S-HALL-3?
                // Let's brute force Wh 1..3
                for (const i of [1, 2, 3]) {
                    // Try construct signature
                    // Assuming Hall items are indexed as `${whId}-${z}-HALL-${p}`
                    if (posToDetail[`${i}-${z}-HALL-${p}`]) return { ...posToDetail[`${i}-${z}-HALL-${p}`], lotCode: normLot, position: posString };
                    // Fallback check
                }
            } else {
                // Rack Logic: `${whId}-${zone.id}-${rack.name}-${level.levelNumber}-${item.position}`
                // Rack name usually just the number string "1", "2".
                // Try Wh 1..3 if explicit Wh missing
                const whs = match[1] ? [parseInt(match[1])] : [1, 2, 3];
                for (const i of whs) {
                    const key = `${i}-${z}-${r}-${l}-${p}`;
                    if (posToDetail[key]) return { ...posToDetail[key], lotCode: normLot, position: posString };

                    // Try "rack name" variation (e.g. "01" vs "1")
                    const key2 = `${i}-${z}-${r.padStart(2, '0')}-${l}-${p}`;
                    if (posToDetail[key2]) return { ...posToDetail[key2], lotCode: normLot, position: posString };
                }
            }
        }

        return null;
    };

    return { isReady, lookupLot };
};
