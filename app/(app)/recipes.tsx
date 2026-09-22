import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { searchFoods } from "@/data/food";
import {
  createRecipe,
  deleteRecipe,
  listRecipes,
  recipePer100g,
  setRecipeVisibility,
  type RecipeIngredientInput,
} from "@/data/recipe";
import { getOrCreateDailyLog, logRecipePortion, todayIso } from "@/data/logs";
import type { MealSlot, RecipeRow } from "@/lib/database.types";
import { Button, Card, Field } from "@/ui/components";
import { colors, radius, spacing, type } from "@/ui/theme";

interface DraftIngredient extends RecipeIngredientInput {
  key: string;
}

let keyCounter = 0;
const nextKey = () => `ing${++keyCounter}`;

export default function Recipes() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [loggingRecipe, setLoggingRecipe] = useState<RecipeRow | null>(null);
  const [portionGrams, setPortionGrams] = useState("");
  const [portionMeal, setPortionMeal] = useState<MealSlot>("snack");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setRecipes(await listRecipes(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleLogPortion() {
    if (!userId || !loggingRecipe) return;
    const g = Number(portionGrams);
    if (!Number.isFinite(g) || g <= 0) {
      Alert.alert("Invalid amount", "Enter the portion weight in grams.");
      return;
    }
    setBusy(true);
    try {
      const per100 = recipePer100g(loggingRecipe);
      const logId = await getOrCreateDailyLog(userId, todayIso());
      await logRecipePortion({
        dailyLogId: logId,
        recipeId: loggingRecipe.id,
        name: loggingRecipe.name,
        grams: g,
        meal: portionMeal,
        per100g: per100,
      });
      setLoggingRecipe(null);
      setPortionGrams("");
      Alert.alert("Logged", `${loggingRecipe.name} (${g} g) added to today.`);
    } catch (e) {
      Alert.alert("Couldn't log", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteRecipe(id);
    await refresh();
  }

  async function toggleShare(r: RecipeRow) {
    await setRecipeVisibility(
      r.id,
      r.visibility === "shared" ? "private" : "shared",
    );
    await refresh();
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {creating ? (
          <RecipeEditor
            userId={userId!}
            onCancel={() => setCreating(false)}
            onSaved={async () => {
              setCreating(false);
              await refresh();
            }}
          />
        ) : (
          <>
            <Button title="+ New recipe" onPress={() => setCreating(true)} />

            {/* Portion logging */}
            {loggingRecipe ? (
              <Card>
                <Text style={styles.cardTitle}>{loggingRecipe.name}</Text>
                <Text style={styles.dim}>
                  {Math.round(recipePer100g(loggingRecipe).calories)} kcal per
                  100 g (cooked)
                </Text>
                <Field
                  label="Portion weight (g)"
                  value={portionGrams}
                  onChangeText={setPortionGrams}
                  keyboardType="numeric"
                  placeholder="e.g. 350"
                />
                <View style={styles.mealRow}>
                  {(["breakfast", "lunch", "dinner", "snack"] as MealSlot[]).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setPortionMeal(m)}
                      style={[styles.mealChip, portionMeal === m && styles.mealChipActive]}
                    >
                      <Text style={[styles.mealChipText, portionMeal === m && styles.mealChipTextActive]}>
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Button
                  title="Log portion"
                  onPress={handleLogPortion}
                  loading={busy}
                />
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() => setLoggingRecipe(null)}
                />
              </Card>
            ) : null}

            <Card>
              <Text style={styles.cardTitle}>Your recipes</Text>
              {recipes.length === 0 ? (
                <Text style={styles.dim}>
                  No recipes yet. Create one to log a whole cooked dish by
                  portion weight.
                </Text>
              ) : (
                recipes.map((r) => (
                  <View key={r.id} style={styles.recipeRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.recipeNameRow}>
                        <Text style={styles.recipeName}>{r.name}</Text>
                        {r.visibility === "shared" ? (
                          <View style={styles.sharedBadge}>
                            <Text style={styles.sharedBadgeText}>shared</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.dim}>
                        {Math.round(recipePer100g(r).calories)} kcal/100g ·
                        whole dish {Math.round(r.total_calories)} kcal
                      </Text>
                    </View>
                    <View style={styles.recipeActions}>
                      <Pressable
                        onPress={() => {
                          setLoggingRecipe(r);
                          setPortionGrams("");
                        }}
                        hitSlop={8}
                      >
                        <Ionicons
                          name="add-circle-outline"
                          size={22}
                          color={colors.primary}
                        />
                      </Pressable>
                      <Pressable onPress={() => toggleShare(r)} hitSlop={8}>
                        <Ionicons
                          name={
                            r.visibility === "shared"
                              ? "people"
                              : "people-outline"
                          }
                          size={20}
                          color={
                            r.visibility === "shared"
                              ? colors.primary
                              : colors.textDim
                          }
                        />
                      </Pressable>
                      <Pressable onPress={() => handleDelete(r.id)} hitSlop={8}>
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={colors.textDim}
                        />
                      </Pressable>
                    </View>
                  </View>
                ))
              }
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Create a recipe: name, ingredients (food + raw grams), final cooked weight. */
function RecipeEditor({
  userId,
  onCancel,
  onSaved,
}: {
  userId: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [cookedWeight, setCookedWeight] = useState("");
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);

  function addIngredient(food: FoodRow, grams: number) {
    // Convert the food's per-serving values to per-100g for the recipe math.
    const per100 = {
      calories: (food.calories / food.serving_size_g) * 100,
      protein: (food.protein / food.serving_size_g) * 100,
      carbs: (food.carbs / food.serving_size_g) * 100,
      fat: (food.fat / food.serving_size_g) * 100,
    };
    setIngredients((prev) => [
      ...prev,
      {
        key: nextKey(),
        foodId: food.id,
        name: food.name,
        rawGrams: grams,
        per100g: per100,
      },
    ]);
  }

  function updateGrams(key: string, grams: number) {
    setIngredients((prev) =>
      prev.map((i) => (i.key === key ? { ...i, rawGrams: grams } : i)),
    );
  }

  function removeIngredient(key: string) {
    setIngredients((prev) => prev.filter((i) => i.key !== key));
  }

  const totalRaw = ingredients.reduce((a, i) => a + i.rawGrams, 0);

  async function save() {
    if (ingredients.length === 0) {
      Alert.alert("No ingredients", "Add at least one ingredient.");
      return;
    }
    const cw = Number(cookedWeight);
    if (!Number.isFinite(cw) || cw <= 0) {
      Alert.alert(
        "Cooked weight needed",
        "Weigh the finished dish and enter its weight in grams.",
      );
      return;
    }
    setBusy(true);
    try {
      await createRecipe(userId, {
        name,
        cookedWeightG: cw,
        ingredients,
        visibility: shared ? "shared" : "private",
      });
      await onSaved();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={styles.cardTitle}>New recipe</Text>
      <Field
        label="Recipe name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Chicken curry batch"
      />

      {/* Ingredients */}
      <Text style={styles.sectionLabel}>Ingredients (raw weights)</Text>
      {ingredients.map((ing) => (
        <View key={ing.key} style={styles.ingredientRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ingredientName}>{ing.name}</Text>
          </View>
          <View style={{ width: 90 }}>
            <Field
              value={String(ing.rawGrams)}
              onChangeText={(v) => updateGrams(ing.key, Number(v) || 0)}
              keyboardType="numeric"
              style={styles.gramsInput}
            />
          </View>
          <Text style={styles.dim}>g</Text>
          <Pressable onPress={() => removeIngredient(ing.key)} hitSlop={8}>
            <Ionicons
              name="close-circle-outline"
              size={20}
              color={colors.textDim}
            />
          </Pressable>
        </View>
      ))}
      <IngredientPicker userId={userId} onAdd={addIngredient} />
      <Text style={styles.dim}>Total raw weight: {Math.round(totalRaw)} g</Text>

      {/* Cooked weight */}
      <Field
        label="Finished (cooked) weight — g"
        value={cookedWeight}
        onChangeText={setCookedWeight}
        keyboardType="numeric"
        placeholder="Weigh the whole dish after cooking"
      />
      <Text style={styles.dim}>
        Weigh the pot/dish before and after cooking, or weigh the finished food.
        This is how we compute accurate per-gram nutrition for portioning.
      </Text>

      {/* Share toggle */}
      <Pressable style={styles.shareRow} onPress={() => setShared(!shared)}>
        <Ionicons
          name={shared ? "checkbox" : "square-outline"}
          size={22}
          color={shared ? colors.primary : colors.textDim}
        />
        <Text style={styles.shareText}>
          Share this recipe (others you share with can portion from it)
        </Text>
      </Pressable>

      <Button title="Save recipe" onPress={save} loading={busy} />
      <Button title="Cancel" variant="ghost" onPress={onCancel} />
    </Card>
  );
}

/** Search the user's foods and add one as an ingredient with a raw weight. */
function IngredientPicker({
  userId,
  onAdd,
}: {
  userId: string;
  onAdd: (food: FoodRow, grams: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodRow[]>([]);
  const [selected, setSelected] = useState<FoodRow | null>(null);
  const [grams, setGrams] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setResults(await searchFoods(userId, q, 8));
    }, 250);
    return () => clearTimeout(t);
  }, [query, userId]);

  return (
    <View style={styles.pickerBox}>
      <Field
        label="Add ingredient"
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setSelected(null);
        }}
        placeholder="Search your foods…"
      />
      {selected ? (
        <View style={styles.selectedIngredient}>
          <Text style={styles.ingredientName}>{selected.name}</Text>
          <View style={styles.selectedRow}>
            <View style={{ width: 100 }}>
              <Field
                label="Raw g"
                value={grams}
                onChangeText={setGrams}
                keyboardType="numeric"
              />
            </View>
            <Button
              title="Add"
              onPress={() => {
                const g = Number(grams);
                if (g > 0) {
                  onAdd(selected, g);
                  setSelected(null);
                  setQuery("");
                  setGrams("");
                }
              }}
            />
          </View>
        </View>
      ) : (
        results.map((f) => (
          <Pressable
            key={f.id}
            style={styles.suggestion}
            onPress={() => {
              setSelected(f);
              setGrams("");
            }}
          >
            <Text style={styles.suggestionText}>{f.name}</Text>
            <Text style={styles.dim}>
              {Math.round(f.calories)} kcal/{f.serving_size_g}g
            </Text>
          </Pressable>
        ))
      }
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  cardTitle: { color: colors.text, ...type.heading },
  sectionLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  recipeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "center",
  },
  recipeNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  recipeName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  sharedBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  sharedBadgeText: {
    color: colors.primaryText,
    fontSize: 10,
    fontWeight: "700",
  },
  recipeActions: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  ingredientName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  gramsInput: { minHeight: 40, paddingVertical: spacing.xs },
  pickerBox: { gap: spacing.xs, marginTop: spacing.xs },
  suggestion: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
  },
  suggestionText: { color: colors.text, fontSize: 14 },
  selectedIngredient: {
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
  },
  selectedRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-end",
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  shareText: { color: colors.text, fontSize: 14 },
  mealRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  mealChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  mealChipActive: {
    backgroundColor: colors.primary,
  },
  mealChipText: {
    color: colors.text,
    fontSize: 14,
  },
  mealChipTextActive: {
    color: colors.primaryText,
    fontWeight: "700",
  },
});
