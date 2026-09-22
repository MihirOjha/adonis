import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "@/lib/auth";
import { colors } from "@/ui/theme";

/**
 * Redirects between the auth screen and the app based on session state.
 */
function useProtectedRoute() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inApp = segments[0] === "(app)";
    if (!session && inApp) {
      router.replace("/sign-in");
    } else if (session && !inApp) {
      router.replace("/(app)");
    }
  }, [session, loading, segments, router]);
}

function RootNavigator() {
  useProtectedRoute();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="sign-in"
        options={{ title: "Adonis", headerShown: false }}
      />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Load the Ionicons font so tab/bar icons render as glyphs, not squares
  // (mainly needed on web, where the font isn't bundled by default).
  const [iconsReady, setIconsReady] = useState(false);
  useEffect(() => {
    Ionicons.loadFont()
      .then(() => setIconsReady(true))
      .catch(() => setIconsReady(true));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="light" />
        {iconsReady ? <RootNavigator /> : null}
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
