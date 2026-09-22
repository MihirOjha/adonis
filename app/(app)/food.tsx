import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { createFood, searchFoods, findFoodByBarcode } from "@/data/food";
import {
  deleteFoodEntry,
  dayTotals,
  getOrCreateDailyLog,
  listFoodEntries,
  logFood,
  todayIso,
} from "@/data/logs";
import { lookupBarcode } from "@/data/openfoodfacts";
import type { FoodEntryRow, FoodRow, MealSlot } from "@/lib/database.types";
import { Button, Card, Field } from "@/ui/components";
import { colors, radius, spacing } from "@/ui/theme";

const MEALS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export default function Food() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [logId, setLogId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<FoodRow[]>([]);
  const [entries, setEntries] = useState<FoodEntryRow[]>([]);
  const [busy, setBusy] = useState(false);

  // barcode + manual add
  const [barcode, setBarcode] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  // inline portion editor (the food currently being logged)
  const [loggingFood, setLoggingFood] = useState<FoodRow | null>(null);
  const [grams, setGrams] = useState("100");
  const [meal, setMeal] = useState<MealSlot>("snack");

  const refresh = useCallback(async () => {
    if (!userId) return;
    const id = await getOrCreateDailyLog(userId, todayIso());
    setLogId(id);
    const [f, e] = await Promise.all([
      searchFoods(userId, query),
      listFoodEntries(id),
    ]);
    setFoods(f);
    setEntries(e);
  }, [userId, query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleBarcode() {
    if (!userId || !barcode.trim()) return;
    setBusy(true);
    try {
      const existing = await findFoodByBarcode(userId, barcode.trim());
      if (existing) {
        Alert.alert("Already saved", `${existing.name} is in your foods.`);
        setBarcode("");
        return;
      }
      const product = await lookupBarcode(barcode.trim());
      if (!product) {
        Alert.alert(
          "Not found",
          "No product for that barcode. Add it manually instead.",
        );
        setManualOpen(true);
        return;
      }
      await createFood(userId, {
        name: product.brand
          ? `${product.name} (${product.brand})`
          : product.name,
        source: "barcode",
        barcode: product.barcode,
        servingSizeG: 100, // Open Food Facts data is per 100 g
        perServing: product.per100g,
        fiber: product.per100g.fiber ?? null,
        sodium: product.per100g.sodium ?? null,
        iron: product.per100g.iron ?? null,
        calcium: product.per100g.calcium ?? null,
        vitaminD: product.per100g.vitaminD ?? null,
      });
      setBarcode("");
      await refresh();
    } catch (e) {
      Alert.alert("Lookup failed", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleLog(food: FoodRow) {
    if (!logId) return;
    // Open the inline portion editor for this food.
    setLoggingFood(food);
    setGrams(food.serving_size_g.toString());
    setMeal("snack");
  }

  async function confirmLog() {
    if (!logId || !loggingFood) return;
    const g = Number(grams);
    if (!Number.isFinite(g) || g <= 0) {
      Alert.alert("Invalid amount", "Enter a weight in grams greater than 0.");
      return;
    }
    setBusy(true);
    try {
      await logFood({ dailyLogId: logId, food: loggingFood, grams: g, meal });
      setLoggingFood(null);
      await refresh();
    } catch (e) {
      Alert.alert("Couldn't log", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteFoodEntry(id);
    await refresh();
  }

  const totals = dayTotals(entries);

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <FlatList
        data={foods}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <Card title="Today's entries">
              {entries.length === 0 ? (
                <Text style={styles.dim}>Nothing logged yet.</Text>
              ) : (
                entries.map((e) => (
                  <Pressable
                    key={e.id}
                    onLongPress={() => handleDelete(e.id)}
                    style={styles.entry}
                  >
                    <Text style={styles.entryText}>
                      {e.meal} · {e.grams} g
                    </Text>
                    <Text style={styles.entryKcal}>
                      {Math.round(e.calories)} kcal
                    </Text>
                  </Pressable>
                ))
              )}
              <Text style={styles.totals}>
                {Math.round(totals.calories)} kcal ·{" "}
                {Math.round(totals.protein)}g P · {Math.round(totals.carbs)}g C
                · {Math.round(totals.fat)}g F
              </Text>
              {entries.length > 0 ? (
                <Text style={styles.hint}>
                  Long-press an entry to remove it.
                </Text>
              ) : null}
            </Card>

            <Card title="Add by barcode">
              <Field
                value={barcode}
                onChangeText={setBarcode}
                placeholder="Type or paste a barcode number"
                keyboardType="number-pad"
              />
              <Button title="Look up" onPress={handleBarcode} loading={busy} />
              <Text style={styles.attribution}>
                Barcode data from Open Food Facts (ODbL).
              </Text>
            </Card>

            {manualOpen ? (
              <ManualFoodForm
                onCancel={() => setManualOpen(false)}
                onSave={async (input) => {
                  if (!userId) return;
                  await createFood(userId, { ...input, source: "manual" });
                  setManualOpen(false);
                  await refresh();
                }}
              />
            ) : (
              <Button
                title="+ Add food manually"
                variant="ghost"
                onPress={() => setManualOpen(true)}
              />
            )}

            <Field
              label="Your foods"
              value={query}
              onChangeText={setQuery}
              placeholder="Search saved foods"
            />

            {loggingFood ? (
              <Card title={`Log: ${loggingFood.name}`}>
                <Text style={styles.dim}>
                  {Math.round(loggingFood.calories)} kcal per{" "}
                  {loggingFood.serving_size_g} g
                </Text>
                <Field
                  label="Amount eaten (g)"
                  value={grams}
                  onChangeText={setGrams}
                  keyboardType="numeric"
                />
                <View style={styles.mealRow}>
                  {MEALS.map((m) => (
                    <Text
                      key={m}
                      onPress={() => setMeal(m)}
                      style={[styles.mealChip, meal === m && styles.mealChipActive]}
                    >
                      {m}
                    </Text>
                  ))}
                </View>
                <Button title="Add to log" onPress={confirmLog} loading={busy} />
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() => setLoggingFood(null)}
                />
              </Card>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.foodRow} onPress={() => handleLog(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.foodName}>{item.name}</Text>
              <Text style={styles.dim}>
                {Math.round(item.calories)} kcal · {item.protein}g P /
                {item.serving_size_g}g
              </Text>
            </View>
            <Text style={styles.add}>Log</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.dim, { paddingHorizontal: spacing.md }]}>
            No saved foods yet.
          </Text>
        }
      />
    </SafeAreaView>
  );
}

function ManualFoodForm({
  onSave,
  onCancel,
}: {
  onSave: (input: {
    name: string;
    servingSizeG: number;
    perServing: { calories: number; protein: number; carbs: number; fat: number };
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [serving, setServing] = useState("100");
  const [cal, setCal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Card title="New food">
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Greek yogurt"
      />
      <Field
        label="Label values are per ___ g (or ml)"
        value={serving}
        onChangeText={setServing}
        keyboardType="numeric"
        placeholder="100"
      />
      <Text style={styles.dim}>
        Enter the numbers exactly as the nutrition label prints them for that
        amount. No need to convert to 100 g — we do that for you.
      </Text>
      <View style={styles.macroRow}>
        <Field
          label="kcal"
          value={cal}
          onChangeText={setCal}
          keyboardType="numeric"
          style={styles.macroInput}
        />
        <Field
          label="Protein"
          value={p}
          onChangeText={setP}
          keyboardType="numeric"
          style={styles.macroInput}
        />
        <Field
          label="Carbs"
          value={c}
          onChangeText={setC}
          keyboardType="numeric"
          style={styles.macroInput}
        />
        <Field
          label="Fat"
          value={f}
          onChangeText={setF}
          keyboardType="numeric"
          style={styles.macroInput}
        />
      </View>
      <Button
        title="Save food"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await onSave({
              name: name.trim() || "Unnamed food",
              servingSizeG: Number(serving) > 0 ? Number(serving) : 100,
              perServing: {
                calories: Number(cal) || 0,
                protein: Number(p) || 0,
                carbs: Number(c) || 0,
                fat: Number(f) || 0,
              },
            });
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button title="Cancel" variant="ghost" onPress={onCancel} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.sm },
  dim: { color: colors.textDim, fontSize: 13 },
  hint: { color: colors.textDim, fontSize: 12, fontStyle: "italic" },
  attribution: { color: colors.textDim, fontSize: 11 },
  entry: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  entryText: { color: colors.text, textTransform: "capitalize" },
  entryKcal: { color: colors.textDim },
  totals: {
    color: colors.text,
    fontWeight: "700",
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  foodRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  foodName: { color: colors.text, fontWeight: "600", fontSize: 15 },
  add: { color: colors.primary, fontWeight: "800" },
  macroRow: { flexDirection: "row", gap: spacing.sm },
  macroInput: { minWidth: 0 },
  mealRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  mealChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealChipActive: {
    backgroundColor: colors.primary,
    color: colors.bg,
    fontWeight: "600",
  },
});
