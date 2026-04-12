import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { DarkModeProvider } from './src/contexts/DarkModeContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { FavoritesProvider } from './src/contexts/FavoritesContext';
import { NotificationPrefsProvider } from './src/contexts/NotificationPrefsContext';
import { OnboardingProvider } from './src/contexts/OnboardingContext';
import { UserStatsProvider } from './src/contexts/UserStatsContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <DarkModeProvider>
        <AuthProvider>
          <OnboardingProvider>
            <NotificationPrefsProvider>
              <FavoritesProvider>
                <UserStatsProvider>
                  <AppNavigator />
                </UserStatsProvider>
              </FavoritesProvider>
            </NotificationPrefsProvider>
          </OnboardingProvider>
        </AuthProvider>
      </DarkModeProvider>
    </SafeAreaProvider>
  );
}
