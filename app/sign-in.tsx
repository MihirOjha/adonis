import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { Button, Card, Field } from "@/ui/components";
import { colors, spacing } from "@/ui/theme";

export default function SignIn() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "in") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, name.trim());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.logo}>Adonis</Text>
            <Text style={styles.tagline}>
              Adaptive nutrition & training, coached by data.
            </Text>
          </View>

          {!env.isConfigured ? (
            <Card>
              <Text style={{ color: colors.warn }}>
                Supabase isn't configured yet. Copy .env.example to .env and add
                your project URL + anon key, then restart the app.
              </Text>
            </Card>
          ) : null}

          <Card title={mode === "in" ? "Sign in" : "Create account"}>
            {mode === "up" ? (
              <Field
                label="Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                placeholder="Your name"
              />
            ) : null}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              title={mode === "in" ? "Sign in" : "Create account"}
              onPress={submit}
              loading={busy}
              disabled={!env.isConfigured}
            />
            <Button
              title={
                mode === "in"
                  ? "Need an account? Sign up"
                  : "Have an account? Sign in"
              }
              variant="ghost"
              onPress={() => {
                setError(null);
                setMode(mode === "in" ? "up" : "in");
              }}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
    flexGrow: 1,
    justifyContent: "center",
  },
  header: { alignItems: "center", gap: spacing.xs, marginBottom: spacing.md },
  logo: {
    color: colors.text,
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 1,
  },
  tagline: { color: colors.textDim, fontSize: 14, textAlign: "center" },
  error: { color: colors.danger, fontSize: 13 },
});
