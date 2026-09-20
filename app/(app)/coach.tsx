import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { getCurrentTarget, getProfile, recomputeTarget } from "@/data/profile";
import type { CoachTargetRow, ProfileRow } from "@/lib/database.types";
import { Button, Card, Stat } from "@/ui/components";
import { colors, spacing } from "@/ui/theme";

export default function Coach() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [target, setTarget] = useState<CoachTargetRow | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [p, t] = await Promise.all([
      getProfile(userId),
      getCurrentTarget(userId),
    ]);
    setProfile(p);
    setTarget(t);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function recalc() {
    if (!profile) return;
    setBusy(true);
    try {
      const t = await recomputeTarget(profile, "manual");
      setTarget(t);
    } catch (e) {
      Alert.alert(
        "Couldn't recalculate",
        e instanceof Error ? e.message : "Error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card title="Adaptive coach">
        <Text style={styles.body}>
          Your coach estimates how much you actually burn by comparing your
          weight trend against what you've eaten, then sets a target to move you
          toward your goal. This is where Muse will plug in to adjust and check
          in weekly.
        </Text>
        <Button
          title="Recalculate target"
          onPress={recalc}
          loading={busy}
          disabled={!profile}
        />
      </Card>

      <Card title="Current target">
        {target ? (
          <>
            <View style={styles.row}>
              <Stat value={`${target.calories}`} label="kcal" />
              <Stat
                value={`${target.protein}g`}
                label="protein"
                accent={colors.primary}
              />
              <Stat value={`${target.carbs}g`} label="carbs" />
              <Stat value={`${target.fat}g`} label="fat" />
            </View>
            {target.expenditure ? (
              <Text style={styles.meta}>
                Estimated maintenance ≈ {target.expenditure} kcal/day
              </Text>
            ) : null}
            {target.rationale ? (
              <Text style={styles.rationale}>{target.rationale}</Text>
            ) : null}
            <Text style={styles.meta}>
              Set by {target.set_by} on {target.effective_date}
            </Text>
          </>
        ) : (
          <Text style={styles.body}>
            No target yet — tap “Recalculate target”. With little data it uses a
            science-based starting estimate, then becomes fully adaptive as you
            log food and weigh in.
          </Text>
        )}
      </Card>

      <Card title="Not medical advice">
        <Text style={styles.disclaimer}>
          Adonis provides general, evidence-based guidance only. Consult a
          qualified professional before significant changes to diet or training.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between" },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  rationale: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: "italic",
  },
  meta: { color: colors.textDim, fontSize: 12 },
  disclaimer: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
});
