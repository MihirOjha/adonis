import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@/lib/auth";
import { getCurrentTarget, getProfile } from "@/data/profile";
import { listBodyMetrics, toWeightPoints } from "@/data/body";
import {
  dayTotals,
  getOrCreateDailyLog,
  listFoodEntries,
  todayIso,
} from "@/data/logs";
import { smoothWeightTrend, weightSlopeKgPerDay } from "@/domain";
import type { CoachTargetRow } from "@/lib/database.types";
import { Card, Stat } from "@/ui/components";
import { colors, spacing } from "@/ui/theme";

interface DayData {
  target: CoachTargetRow | null;
  totals: { calories: number; protein: number; carbs: number; fat: number };
  trendKg: number | null;
  slopeKgPerWeek: number | null;
}

export default function Dashboard() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [data, setData] = useState<DayData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [target, metrics] = await Promise.all([
      getCurrentTarget(userId),
      listBodyMetrics(userId),
    ]);
    await getProfile(userId); // ensure profile exists / warm cache
    const logId = await getOrCreateDailyLog(userId, todayIso());
    const entries = await listFoodEntries(logId);
    const trend = smoothWeightTrend(toWeightPoints(metrics));
    const slope = weightSlopeKgPerDay(trend);
    setData({
      target,
      totals: dayTotals(entries),
      trendKg: trend.at(-1)?.trendKg ?? null,
      slopeKgPerWeek: slope === null ? null : slope * 7,
    });
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const target = data?.target;
  const totals = data?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const calRemaining = target ? target.calories - totals.calories : null;
  const proteinRemaining = target ? target.protein - totals.protein : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <Card title="Today's target">
        {target ? (
          <View style={styles.row}>
            <Stat value={`${target.calories}`} label="kcal goal" />
            <Stat
              value={`${target.protein}g`}
              label="protein"
              accent={colors.primary}
            />
            <Stat value={`${target.carbs}g`} label="carbs" />
            <Stat value={`${target.fat}g`} label="fat" />
          </View>
        ) : (
          <Text style={styles.dim}>
            No target yet. Open the Coach tab and tap “Recalculate” to generate
            your first adaptive target.
          </Text>
        )}
      </Card>

      <Card title="Eaten so far">
        <View style={styles.row}>
          <Stat value={`${Math.round(totals.calories)}`} label="kcal" />
          <Stat
            value={`${Math.round(totals.protein)}g`}
            label="protein"
            accent={colors.primary}
          />
          <Stat value={`${Math.round(totals.carbs)}g`} label="carbs" />
          <Stat value={`${Math.round(totals.fat)}g`} label="fat" />
        </View>
        {calRemaining !== null ? (
          <Text style={styles.remaining}>
            {calRemaining >= 0
              ? `${calRemaining} kcal remaining`
              : `${Math.abs(calRemaining)} kcal over`}
            {proteinRemaining !== null && proteinRemaining > 0
              ? ` · ${Math.round(proteinRemaining)}g protein to go`
              : ""}
          </Text>
        ) : null}
      </Card>

      <Card title="Weight trend">
        {data?.trendKg != null ? (
          <View style={styles.row}>
            <Stat
              value={`${data.trendKg.toFixed(1)} kg`}
              label="trend weight"
            />
            <Stat
              value={
                data.slopeKgPerWeek == null
                  ? "—"
                  : `${data.slopeKgPerWeek >= 0 ? "+" : ""}${data.slopeKgPerWeek.toFixed(2)}`
              }
              label="kg / week"
              accent={
                data.slopeKgPerWeek == null
                  ? colors.textDim
                  : data.slopeKgPerWeek < 0
                    ? colors.success
                    : colors.warn
              }
            />
          </View>
        ) : (
          <Text style={styles.dim}>
            No weigh-ins yet. Add one on the Body tab (or sync your scale).
          </Text>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between" },
  dim: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  remaining: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
