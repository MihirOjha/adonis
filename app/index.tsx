import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { colors } from "@/ui/theme";

/** Entry route: sends the user to the app or the sign-in screen. */
export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <Redirect href={session ? "/(app)" : "/sign-in"} />;
}
