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
  const calProgress =
    target && target.calories > 0
      ? Math.min(totals.calories / target.calories, 1)
      : 0;

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
      {/* Hero: calories remaining + ring */}
      <Card>
        {target ? (
          <View style={styles.heroRow}>
            <View style={styles.ringWrap}>
              <ProgressRing progress={calProgress} size={120} />
              <View style={styles.ringCenter}>
                <Text style={styles.ringValue}>
                  {Math.max(Math.round(calRemaining ?? 0), 0)}
                </Text>
                <Text style={styles.ringLabel}>kcal left</Text>
              </View>
            </View>
            <View style={styles.heroStats}>
              <HeroStat label="Goal" value={`${target.calories}`} />
              <HeroStat label="Eaten" value={`${Math.round(totals.calories)}`} />
              <HeroStat
                label="Protein left"
                value={
                  proteinRemaining != null && proteinRemaining > 0
                    ? `${Math.round(proteinRemaining)}g`
                    : "0g"
                }
                accent={colors.primary}
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.cardTitle}>Today's target</Text>
            <Text style={styles.dim}>
              No target yet. Open the Coach tab and tap "Recalculate" to generate
              your first adaptive target.
            </Text>
          </View>
        )}
      </Card>

      {/* Macros */}
      {target ? (
        <Card>
          <Text style={styles.cardTitle}>Macros</Text>
          <MacroBar
            label="Protein"
            eaten={totals.protein}
            goal={target.protein}
            color={colors.primary}
          />
          <MacroBar
            label="Carbs"
            eaten={totals.carbs}
            goal={target.carbs}
            color={colors.success}
          />
          <MacroBar
            label="Fat"
            eaten={totals.fat}
            goal={target.fat}
            color={colors.warn}
          />
        </Card>
      ) : null}

      {/* Weight trend */}
      <Card>
        <Text style={styles.cardTitle}>Weight trend</Text>
        {data?.trendKg != null ? (
          <View style={styles.trendRow}>
            <View>
              <Text style={styles.trendValue}>{data.trendKg.toFixed(1)} kg</Text>
              <Text style={styles.dim}>smoothed trend</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={[
                  styles.trendSlope,
                  {
                    color:
                      data.slopeKgPerWeek == null
                        ? colors.textDim
                        : data.slopeKgPerWeek < 0
                        ? colors.success
                        : colors.warn,
                  },
                ]}
              >
                {data.slopeKgPerWeek == null
                  ? "—"
                  : `${data.slopeKgPerWeek >= 0 ? "+" : ""}${data.slopeKgPerWeek.toFixed(2)} kg/wk`}
              </Text>
              <Text style={styles.dim}>rate of change</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.dim}>
            No weigh-ins yet. Add one on the Body tab.
          </Text>
        )}
      </Card>
    </ScrollView>
  );
}

function HeroStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={styles.heroStat}>
      <Text style={[styles.heroStatValue, accent ? { color: accent } : null]}>
        {value}
      </Text>
      <Text style={styles.dim}>{label}</Text>
    </View>
  );
}

function MacroBar({
  label,
  eaten,
  goal,
  color,
}: {
  label: string;
  eaten: number;
  goal: number;
  color: string;
}) {
  const pct = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  return (
    <View style={styles.macroBarWrap}>
      <View style={styles.macroBarHeader}>
        <Text style={styles.macroBarLabel}>{label}</Text>
        <Text style={styles.dim}>
          {Math.round(eaten)} / {goal}g
        </Text>
      </View>
      <View style={styles.macroBarTrack}>
        <View
          style={[
            styles.macroBarFill,
            { width: `${pct * 100}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

/** A simple SVG-free progress ring using a bordered circle + overlay. */
function ProgressRing({
  progress,
  size,
}: {
  progress: number;
  size: number;
}) {
  const p = Math.max(0, Math.min(progress, 1));
  const deg = p * 360;
  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: colors.surfaceAlt,
        },
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: size / 2,
            // Conic-like fill via a rotated half overlay (works on web + native).
            overflow: "hidden",
          },
        ]}
      >
        <View
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 10,
            borderColor: colors.primary,
            borderTopColor: deg > 0 ? colors.primary : "transparent",
            transform: [{ rotate: `${deg - 45}deg` }],
            opacity: 0.9,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  ringWrap: { position: "relative", alignItems: "center", justifyContent: "center" },
  ring: { borderWidth: 10 },
  ringCenter: { position: "absolute", alignItems: "center" },
  ringValue: { color: colors.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  ringLabel: { color: colors.textDim, fontSize: 12 },
  heroStats: { flex: 1, gap: spacing.sm },
  heroStat: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroStatValue: { color: colors.text, fontSize: 17, fontWeight: "700" },
  macroBarWrap: { gap: spacing.xs },
  macroBarHeader: { flexDirection: "row", justifyContent: "space-between" },
  macroBarLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  macroBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
  },
  macroBarFill: { height: 8, borderRadius: 4 },
  trendRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  trendValue: { color: colors.text, fontSize: 24, fontWeight: "800" },
  trendSlope: { fontSize: 17, fontWeight: "700" },
});
