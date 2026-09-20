import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { listBodyMetrics, toWeightPoints, upsertBodyMetric } from "@/data/body";
import { smoothWeightTrend, weightSlopeKgPerDay } from "@/domain";
import { todayIso } from "@/data/logs";
import type { BodyMetricRow } from "@/lib/database.types";
import { Button, Card, Field, Stat } from "@/ui/components";
import { colors, spacing } from "@/ui/theme";

export default function Body() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [metrics, setMetrics] = useState<BodyMetricRow[]>([]);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setMetrics(await listBodyMetrics(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function save() {
    if (!userId || !weight.trim()) return;
    setBusy(true);
    try {
      await upsertBodyMetric({
        userId,
        date: todayIso(),
        weightKg: Number(weight),
        waistCm: waist ? Number(waist) : undefined,
        bodyFat: bodyFat ? Number(bodyFat) : undefined,
        source: "manual",
      });
      setWeight("");
      setWaist("");
      setBodyFat("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const trend = smoothWeightTrend(toWeightPoints(metrics));
  const trendKg = trend.at(-1)?.trendKg ?? null;
  const slope = weightSlopeKgPerDay(trend);
  const slopePerWeek = slope === null ? null : slope * 7;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card title="Trend">
        {trendKg != null ? (
          <View style={styles.row}>
            <Stat value={`${trendKg.toFixed(1)} kg`} label="trend weight" />
            <Stat
              value={
                slopePerWeek == null
                  ? "—"
                  : `${slopePerWeek >= 0 ? "+" : ""}${slopePerWeek.toFixed(2)}`
              }
              label="kg / week"
              accent={
                slopePerWeek == null
                  ? colors.textDim
                  : slopePerWeek < 0
                    ? colors.success
                    : colors.warn
              }
            />
          </View>
        ) : (
          <Text style={styles.dim}>Log your first weigh-in below.</Text>
        )}
        <Text style={styles.dim}>
          Trend uses a smoothed average — daily noise from water and food is
          expected. Judge progress over weeks, not days.
        </Text>
      </Card>

      <Card title="Log today's weigh-in">
        <Field
          label="Weight (kg)"
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          placeholder="e.g. 78.4"
        />
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field
              label="Waist (cm)"
              value={waist}
              onChangeText={setWaist}
              keyboardType="numeric"
              placeholder="optional"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Body fat (%)"
              value={bodyFat}
              onChangeText={setBodyFat}
              keyboardType="numeric"
              placeholder="optional"
            />
          </View>
        </View>
        <Button title="Save weigh-in" onPress={save} loading={busy} />
        <Text style={styles.dim}>
          Tip: on mobile you can automate this by syncing your Renpho scale
          through Apple Health / Health Connect (see the roadmap).
        </Text>
      </Card>

      <Card title="History">
        {metrics.length === 0 ? (
          <Text style={styles.dim}>No measurements yet.</Text>
        ) : (
          metrics.slice(0, 30).map((m) => (
            <View key={m.id} style={styles.histRow}>
              <Text style={styles.histDate}>{m.metric_date}</Text>
              <Text style={styles.histVal}>
                {m.weight_kg != null ? `${m.weight_kg} kg` : "—"}
                {m.body_fat != null ? ` · ${m.body_fat}%` : ""}
                {m.source === "health" ? "  ⌚" : ""}
              </Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between" },
  row2: { flexDirection: "row", gap: spacing.sm },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  histRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  histDate: { color: colors.textDim },
  histVal: { color: colors.text, fontWeight: "600" },
});
