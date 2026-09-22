import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { getProfile, updateProfile } from "@/data/profile";
import {
  createMuseToken,
  listMuseTokens,
  revokeMuseToken,
  type MuseTokenRow,
} from "@/data/muse";
import type {
  ActivityLevel,
  Goal,
  ProfileRow,
  Sex,
} from "@/lib/database.types";
import { Button, Card, Field } from "@/ui/components";
import { colors, radius, spacing } from "@/ui/theme";

const GOALS: Goal[] = ["cut", "maintain", "bulk", "recomp"];
const SEXES: Sex[] = ["male", "female"];
const ACTIVITIES: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];

export default function Profile() {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [name, setName] = useState("");
  const [height, setHeight] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [sex, setSex] = useState<Sex>("male");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<MuseTokenRow[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const p = await getProfile(userId);
    if (p) {
      setProfile(p);
      setName(p.name);
      setHeight(p.height_cm?.toString() ?? "");
      setBirthdate(p.birthdate ?? "");
      setSex(p.sex ?? "male");
      setGoal(p.goal);
      setActivity(p.activity);
    }
    setTokens(await listMuseTokens(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function save() {
    if (!userId) return;
    setBusy(true);
    try {
      await updateProfile(userId, {
        name: name.trim(),
        height_cm: height ? Number(height) : null,
        birthdate: birthdate.trim() || null,
        sex,
        goal,
        activity,
      });
      Alert.alert("Saved", "Your profile has been updated.");
      await refresh();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function makeToken() {
    if (!userId) return;
    setTokenBusy(true);
    try {
      const raw = await createMuseToken(userId, "Muse");
      setNewToken(raw);
      await refresh();
    } catch (e) {
      Alert.alert(
        "Couldn't create token",
        e instanceof Error ? e.message : "Error",
      );
    } finally {
      setTokenBusy(false);
    }
  }

  async function revoke(id: string) {
    setTokenBusy(true);
    try {
      await revokeMuseToken(id);
      await refresh();
    } catch (e) {
      Alert.alert("Couldn't revoke", e instanceof Error ? e.message : "Error");
    } finally {
      setTokenBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card title="Profile">
        <Field label="Name" value={name} onChangeText={setName} />
        <Field
          label="Height (cm)"
          value={height}
          onChangeText={setHeight}
          keyboardType="numeric"
          placeholder="e.g. 178"
        />
        <Field
          label="Birthdate (YYYY-MM-DD)"
          value={birthdate}
          onChangeText={setBirthdate}
          placeholder="1990-05-20"
          autoCapitalize="none"
        />
        <Chips label="Sex" options={SEXES} value={sex} onChange={setSex} />
        <Chips
          label="Activity"
          options={ACTIVITIES}
          value={activity}
          onChange={setActivity}
        />
        <Chips label="Goal" options={GOALS} value={goal} onChange={setGoal} />
        <Button title="Save profile" onPress={save} loading={busy} />
        <Text style={styles.dim}>
          These feed the coach's starting estimate before it becomes fully
          adaptive.
        </Text>
      </Card>

      <Card title="Muse access">
        <Text style={styles.dim}>
          Generate a scoped token to let your Muse coach read your data and set
          targets. A token only ever touches your own data, and you can revoke
          it anytime.
        </Text>
        <Button
          title="Generate Muse token"
          onPress={makeToken}
          loading={tokenBusy}
        />
        {newToken ? (
          <View style={styles.tokenBox}>
            <Text style={styles.tokenLabel}>
              Copy this now — it won't be shown again:
            </Text>
            <Text style={styles.tokenValue} selectable>
              {newToken}
            </Text>
          </View>
        ) : null}
        {tokens
          .filter((t) => !t.revoked_at)
          .map((t) => (
            <View key={t.id} style={styles.tokenRow}>
              <Text style={styles.dim}>
                {t.label} · created {t.created_at.slice(0, 10)}
                {t.last_used_at ? ` · used ${t.last_used_at.slice(0, 10)}` : ""}
              </Text>
              <Text style={styles.revoke} onPress={() => revoke(t.id)}>
                Revoke
              </Text>
            </View>
          ))}
      </Card>

      <Card title="Account">
        <Text style={styles.dim}>{session?.user.email}</Text>
        <Button title="Sign out" variant="danger" onPress={() => signOut()} />
      </Card>
    </ScrollView>
  );
}

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.chipLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <Text
              key={opt}
              onPress={() => onChange(opt)}
              style={[styles.chip, active && styles.chipActive]}
            >
              {opt.replace("_", " ")}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  chipLabel: { color: colors.textDim, fontSize: 13, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    color: colors.textDim,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    overflow: "hidden",
    textTransform: "capitalize",
  },
  chipActive: {
    color: colors.primaryText,
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    fontWeight: "700",
  },
  tokenBox: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  tokenLabel: { color: colors.textDim, fontSize: 12 },
  tokenValue: {
    color: colors.text,
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 18,
  },
  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  revoke: { color: colors.danger, fontSize: 13, fontWeight: "600" },
});
