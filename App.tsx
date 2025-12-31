import { StatusBar } from 'expo-status-bar';
import { Text, View, TouchableOpacity, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AssignScreen from './src/screens/AssignScreen';
import ExportScreen from './src/screens/ExportScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import WorkScreen from './src/screens/WorkScreen';
import LoginScreen from './src/screens/LoginScreen';
import { authService } from './src/services/auth';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentTab, setCurrentTab] = useState<'work' | 'assign' | 'export' | 'settings'>('work');
  const [isChecking, setIsChecking] = useState(true);

  // ... (checkAuth unchanged)
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const user = await authService.getUser();
    if (user) setIsAuthenticated(true);
    setIsChecking(false);
  };

  const handleLogout = async () => {
    await authService.logout();
    setIsAuthenticated(false);
  };

  if (isChecking) {
    return (
      <View className="flex-1 bg-zinc-900 justify-center items-center">
        <Text className="text-white">Đang tải...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#18181b' }} edges={['top', 'bottom']}>
        <StatusBar style="light" />

        {/* Main Content Area */}
        <View className="flex-1 bg-zinc-50 relative">
          {currentTab === 'work' && <WorkScreen />}
          {currentTab === 'assign' && <AssignScreen />}
          {currentTab === 'export' && <ExportScreen />}
          {currentTab === 'settings' && <SettingsScreen onLogout={handleLogout} />}
        </View>

        {/* Bottom Navigation */}
        <View className="bg-white border-t border-zinc-200 pb-2 pt-2 px-2 flex-row justify-around items-center">
          <TouchableOpacity
            className="items-center p-2 rounded-lg"
            onPress={() => setCurrentTab('work')}
          >
            <Feather name="briefcase" size={24} color={currentTab === 'work' ? '#2563eb' : '#a1a1aa'} />
            <Text className={`text-[10px] font-black mt-1 ${currentTab === 'work' ? 'text-blue-600' : 'text-zinc-400'}`}>
              Công Việc
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="items-center p-2 rounded-lg"
            onPress={() => setCurrentTab('assign')}
          >
            <Feather name="package" size={24} color={currentTab === 'assign' ? '#059669' : '#a1a1aa'} />
            <Text className={`text-[10px] font-black mt-1 ${currentTab === 'assign' ? 'text-emerald-600' : 'text-zinc-400'}`}>
              Gán Vị Trí
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="items-center p-2 rounded-lg"
            onPress={() => setCurrentTab('export')}
          >
            <Feather name="upload-cloud" size={24} color={currentTab === 'export' ? '#e11d48' : '#a1a1aa'} />
            <Text className={`text-[10px] font-black mt-1 ${currentTab === 'export' ? 'text-rose-600' : 'text-zinc-400'}`}>
              Xuất Kho
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="items-center p-2 rounded-lg"
            onPress={() => setCurrentTab('settings')}
          >
            <Feather name="settings" size={24} color={currentTab === 'settings' ? '#27272a' : '#a1a1aa'} />
            <Text className={`text-[10px] font-black mt-1 ${currentTab === 'settings' ? 'text-zinc-800' : 'text-zinc-400'}`}>
              Cài Đặt
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
