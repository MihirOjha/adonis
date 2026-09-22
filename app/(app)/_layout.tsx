import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getProfile } from "@/data/profile";
import { ThemeProvider, useTheme } from "@/ui/ThemeProvider";
import { colors as defaultColors } from "@/ui/theme";

function ThemedTabs() {
  const colors = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "800" },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="today-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="food"
        options={{
          title: "Food",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: "Recipes",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: "Training",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="barbell-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="body"
        options={{
          title: "Body",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="body-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: "Coach",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function AppTabs() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [accent, setAccent] = useState<string | null>(null);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getProfile(userId)
      .then((p) => {
        if (!cancelled) setAccent(p?.theme_color ?? null);
      })
      .catch(() => {
        if (!cancelled) setAccent(null);
      })
      .finally(() => {
        if (!cancelled) setThemeReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Don't render until the theme color has loaded, so there's no flash of the
  // default theme followed by the user's color.
  if (!themeReady) return null;

  return (
    <ThemeProvider accent={accent} key={accent ?? "default"}>
      <ThemedTabs />
    </ThemeProvider>
  );
}
