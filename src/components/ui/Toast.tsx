import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';

type ToastType = 'success' | 'warning' | 'error' | 'info';

interface ToastProps {
    visible: boolean;
    message: string;
    type?: ToastType;
    onHide?: () => void;
    duration?: number;
}

const { width } = Dimensions.get('window');

export const Toast: React.FC<ToastProps> = ({
    visible,
    message,
    type = 'info',
    onHide,
    duration = 3000
}) => {
    const translateY = useRef(new Animated.Value(-100)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    speed: 12,
                    bounciness: 5
                }),
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true
                })
            ]).start();

            if (duration > 0 && onHide) {
                const timer = setTimeout(() => {
                    hide();
                }, duration);
                return () => clearTimeout(timer);
            }
        } else {
            hide();
        }
    }, [visible]);

    const hide = () => {
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: -100,
                duration: 300,
                useNativeDriver: true
            }),
            Animated.timing(opacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true
            })
        ]).start(() => {
            if (onHide && visible) onHide();
        });
    };

    // Check if invisible
    // @ts-ignore - _value is a private API of Animated but widely used
    if (!visible && (opacity as any)._value === 0) return null;

    const getBgColor = () => {
        switch (type) {
            case 'success': return '#10b981'; // emerald-500
            case 'warning': return '#f59e0b'; // amber-500
            case 'error': return '#ef4444';   // red-500
            case 'info': default: return '#3b82f6'; // blue-500
        }
    };

    const getIcon = () => {
        switch (type) {
            case 'success': return 'check-circle';
            case 'warning': return 'alert-triangle';
            case 'error': return 'x-circle';
            case 'info': default: return 'info';
        }
    };

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    backgroundColor: getBgColor(),
                    transform: [{ translateY }],
                    opacity
                }
            ]}
        >
            <Feather name={getIcon()} size={24} color="white" style={styles.icon} />
            <Text style={styles.text}>{message}</Text>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 50, // Below status bar
        left: 20,
        right: 20,
        padding: 16,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.20,
        shadowRadius: 5.62,
        elevation: 8,
        zIndex: 9999,
    },
    icon: {
        marginRight: 12,
    },
    text: {
        color: 'white',
        fontWeight: '700',
        fontSize: 14,
        flex: 1,
    }
});
