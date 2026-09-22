import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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
import { searchUsda } from "@/data/usda";
import { env } from "@/lib/env";
import type { FoodEntryRow, FoodRow, MealSlot } from "@/lib/database.types";
import { Button, Card, Field } from "@/ui/components";
import { BarcodeScanner } from "@/ui/BarcodeScanner";
import { colors, radius, spacing, type } from "@/ui/theme";

const MEALS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

/** A search result that isn't saved yet (from USDA text search). */
interface ExternalFood {
  key: string;
  name: string;
  brand?: string;
  per100g: { calories: number; protein: number; carbs: number; fat: number };
}

export default function Food() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [logId, setLogId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [savedFoods, setSavedFoods] = useState<FoodRow[]>([]);
  const [external, setExternal] = useState<ExternalFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [entries, setEntries] = useState<FoodEntryRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  // portion editor
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
    setSavedFoods(f);
    setEntries(e);
  }, [userId, query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Debounced USDA search when the query has 3+ chars and few local hits.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || !env.usdaApiKey) {
      setExternal([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const usda = await searchUsda(q, env.usdaApiKey, 12);
      setExternal(
        usda.map((u) => ({
          key: `usda-${u.fdcId}`,
          name: u.description,
          brand: u.brand,
          per100g: u.per100g,
        })),
      );
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  async function saveBarcodeProduct(barcodeValue: string) {
    if (!userId) return;
    setBusy(true);
    try {
      const existing = await findFoodByBarcode(userId, barcodeValue);
      if (existing) {
        Alert.alert("Already saved", `${existing.name} is in your foods.`);
        return;
      }
      const product = await lookupBarcode(barcodeValue);
      if (!product) {
        Alert.alert(
          "Not found",
          "No product for that barcode. Add it manually instead.",
        );
        setManualOpen(true);
        return;
      }

      // Convert OFF's per-100g values to the label's per-serving values so the
      // food displays and logs exactly as the label reads (e.g. "180 kcal per
      // 50 g bar"), not doubled.
      const servingG = product.servingSizeG;
      const toServing = (per100: number) => (per100 * servingG) / 100;
      await createFood(userId, {
        name: product.brand
          ? `${product.name} (${product.brand})`
          : product.name,
        source: "barcode",
        barcode: product.barcode,
        servingSizeG: servingG,
        perServing: {
          calories: toServing(product.per100g.calories),
          protein: toServing(product.per100g.protein),
          carbs: toServing(product.per100g.carbs),
          fat: toServing(product.per100g.fat),
        },
        fiber: product.per100g.fiber != null ? toServing(product.per100g.fiber) : null,
        sodium: product.per100g.sodium != null ? toServing(product.per100g.sodium) : null,
        iron: product.per100g.iron != null ? toServing(product.per100g.iron) : null,
        calcium: product.per100g.calcium != null ? toServing(product.per100g.calcium) : null,
        vitaminD: product.per100g.vitaminD != null ? toServing(product.per100g.vitaminD) : null,
      });
      await refresh();
    } catch (e) {
      Alert.alert("Lookup failed", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleScan(barcodeValue: string) {
    setScannerOpen(false);
    await saveBarcodeProduct(barcodeValue);
  }

  async function saveExternal(food: ExternalFood) {
    if (!userId) return;
    setBusy(true);
    try {
      const created = await createFood(userId, {
        name: food.brand ? `${food.name} (${food.brand})` : food.name,
        source: "usda",
        servingSizeG: 100,
        perServing: food.per100g,
      });
      setQuery("");
      setExternal([]);
      await refresh();
      openLogEditor(created);
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function openLogEditor(food: FoodRow) {
    if (!logId) return;
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
  const showExternal = external.length > 0 && savedFoods.length < 5;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Today's log */}
        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Today</Text>
            <Text style={styles.totalsText}>
              {Math.round(totals.calories)} kcal
            </Text>
          </View>
          <View style={styles.macroTotals}>
            <MacroPill label="Protein" value={totals.protein} />
            <MacroPill label="Carbs" value={totals.carbs} />
            <MacroPill label="Fat" value={totals.fat} />
          </View>
          {entries.length === 0 ? (
            <Text style={styles.dim}>
              Nothing logged yet. Search or scan below.
            </Text>
          ) : (
            entries.map((e) => (
              <View key={e.id} style={styles.entryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryName}>{e.name ?? "Food"}</Text>
                  <Text style={styles.dim}>
                    {e.meal} · {e.grams} g
                  </Text>
                </View>
                <Text style={styles.entryKcal}>{Math.round(e.calories)}</Text>
                <Pressable onPress={() => handleDelete(e.id)} hitSlop={8}>
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={colors.textDim}
                  />
                </Pressable>
              </View>
            ))
          }
        </Card>

        {/* Search + scan */}
        <Card>
          <View style={styles.searchRow}>
            <View style={{ flex: 1 }}>
              <Field
                value={query}
                onChangeText={setQuery}
                placeholder="Search or add a food…"
                style={styles.searchInput}
              />
            </View>
            <Pressable
              style={styles.scanBtn}
              onPress={() => setScannerOpen(true)}
            >
              <Ionicons
                name="barcode-outline"
                size={22}
                color={colors.primaryText}
              />
            </Pressable>
          </View>
          {searching ? (
            <View style={styles.centerRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.dim}>Searching…</Text>
            </View>
          ) : null}
        </Card>

        {/* Portion editor */}
        {loggingFood ? (
          <Card>
            <Text style={styles.cardTitle}>{loggingFood.name}</Text>
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
                <Pressable
                  key={m}
                  onPress={() => setMeal(m)}
                  style={[styles.mealChip, meal === m && styles.mealChipActive]}
                >
                  <Text
                    style={[
                      styles.mealChipText,
                      meal === m && styles.mealChipTextActive,
                    ]}
                  >
                    {m}
                  </Text>
                </Pressable>
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

        {/* External results */}
        {showExternal ? (
          <Card>
            <Text style={styles.cardTitle}>From food database</Text>
            {external.map((f) => (
              <Pressable
                key={f.key}
                style={styles.resultRow}
                onPress={() => saveExternal(f)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{f.name}</Text>
                  <Text style={styles.dim}>
                    {Math.round(f.per100g.calories)} kcal ·{" "}
                    {Math.round(f.per100g.protein)}g P /100g
                  </Text>
                </View>
                <Ionicons
                  name="add-circle-outline"
                  size={22}
                  color={colors.primary}
                />
              </Pressable>
            ))}
            <Text style={styles.attribution}>
              Includes USDA FoodData Central.
            </Text>
          </Card>
        ) : null}

        {/* Saved foods */}
        <Card>
          <Text style={styles.cardTitle}>Your foods</Text>
          {savedFoods.length === 0 ? (
            <Text style={styles.dim}>
              No saved foods yet. Search above or scan a barcode.
            </Text>
          ) : (
            savedFoods.map((f) => (
              <Pressable
                key={f.id}
                style={styles.resultRow}
                onPress={() => openLogEditor(f)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{f.name}</Text>
                  <Text style={styles.dim}>
                    {Math.round(f.calories)} kcal · {Math.round(f.protein)}g P /
                    {f.serving_size_g}g
                  </Text>
                </View>
                <Ionicons
                  name="add-circle-outline"
                  size={22}
                  color={colors.primary}
                />
              </Pressable>
            ))
          }
        </Card>

        {/* Manual add */}
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
            title="+ New food (manual)"
            variant="ghost"
            onPress={() => setManualOpen(true)}
          />
        )}

        <Text style={styles.attribution}>
          Barcode data from Open Food Facts (ODbL).
        </Text>
      </ScrollView>

      {/* Camera scanner modal */}
      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        <SafeAreaView style={styles.scannerScreen}>
          <View style={styles.scannerBody}>
            <BarcodeScanner
              onScan={handleScan}
              onClose={() => setScannerOpen(false)}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function MacroPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.macroPill}>
      <Text style={styles.macroPillValue}>{Math.round(value)}g</Text>
      <Text style={styles.macroPillLabel}>{label}</Text>
    </View>
  );
}

function ManualFoodForm({
  onSave,
  onCancel,
}: {
  onSave: (input: {
    name: string;
    servingSizeG: number;
    perServing: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
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
    <Card>
      <Text style={styles.cardTitle}>New food</Text>
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
        Enter the numbers exactly as the label prints them for that amount. We
        handle the math.
      </Text>
      <View style={styles.macroGrid}>
        <Field
          label="Calories (kcal)"
          value={cal}
          onChangeText={setCal}
          keyboardType="numeric"
          style={styles.macroField}
        />
        <Field
          label="Protein (g)"
          value={p}
          onChangeText={setP}
          keyboardType="numeric"
          style={styles.macroField}
        />
        <Field
          label="Carbs (g)"
          value={c}
          onChangeText={setC}
          keyboardType="numeric"
          style={styles.macroField}
        />
        <Field
          label="Fat (g)"
          value={f}
          onChangeText={setF}
          keyboardType="numeric"
          style={styles.macroField}
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
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  cardTitle: { color: colors.text, ...type.heading },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalsText: { color: colors.text, fontSize: 22, fontWeight: "800" },
  macroTotals: { flexDirection: "row", gap: spacing.sm },
  macroPill: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  macroPillValue: { color: colors.text, fontWeight: "700", fontSize: 15 },
  macroPillLabel: { color: colors.textDim, fontSize: 11 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  entryName: { color: colors.text, fontWeight: "600", fontSize: 15 },
  entryKcal: { color: colors.text, fontWeight: "700", fontSize: 15 },
  searchRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  searchInput: { marginBottom: 0 },
  scanBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  centerRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resultName: { color: colors.text, fontWeight: "600", fontSize: 15 },
  mealRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  mealChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mealChipText: {
    color: colors.textDim,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  mealChipTextActive: { color: colors.primaryText },
  macroGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  macroField: { flexBasis: "48%", flexGrow: 1 },
  attribution: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  scannerScreen: { flex: 1, backgroundColor: colors.bg },
  scannerBody: { padding: spacing.md, flex: 1, justifyContent: "center" },
});
