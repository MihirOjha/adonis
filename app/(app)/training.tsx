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
import {
  deleteWorkout,
  listExercises,
  listWorkouts,
  saveWorkout,
  type SessionWithSets,
  type SetInput,
} from "@/data/workout";
import { Button, Card, Field } from "@/ui/components";
import { colors, radius, spacing, type } from "@/ui/theme";

/** A set being edited in the active-workout form. */
interface DraftSet extends SetInput {
  key: string;
}
interface DraftExercise {
  key: string;
  name: string;
  sets: DraftSet[];
}

let keyCounter = 0;
const nextKey = () => `k${++keyCounter}`;

export default function Training() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [sessions, setSessions] = useState<SessionWithSets[]>([]);
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [logging, setLogging] = useState(false);
  const [busy, setBusy] = useState(false);

  // active workout draft
  const [workoutName, setWorkoutName] = useState("Workout");
  const [exercises, setExercises] = useState<DraftExercise[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [s, ex] = await Promise.all([
      listWorkouts(userId),
      listExercises(userId),
    ]);
    setSessions(s);
    setExerciseNames(ex.map((e) => e.name));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function startWorkout() {
    setWorkoutName("Workout");
    setExercises([]);
    setLogging(true);
  }

  function addExercise(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setExercises((prev) => [
      ...prev,
      { key: nextKey(), name: trimmed, sets: [] },
    ]);
  }

  function addSet(exKey: string) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.key === exKey
          ? {
              ...ex,
              sets: [
                ...ex.sets,
                { key: nextKey(), exercise: ex.name, reps: 0 },
              ],
            }
          : ex,
      ),
    );
  }

  function updateSet(exKey: string, setKey: string, patch: Partial<DraftSet>) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.key === exKey
          ? {
              ...ex,
              sets: ex.sets.map((s) =>
                s.key === setKey ? { ...s, ...patch } : s,
              ),
            }
          : ex,
      ),
    );
  }

  function removeSet(exKey: string, setKey: string) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.key === exKey
          ? { ...ex, sets: ex.sets.filter((s) => s.key !== setKey) }
          : ex,
      ),
    );
  }

  function removeExercise(exKey: string) {
    setExercises((prev) => prev.filter((ex) => ex.key !== exKey));
  }

  async function finishWorkout() {
    if (!userId) return;
    const sets: SetInput[] = [];
    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (s.reps > 0) {
          sets.push({
            exercise: ex.name,
            reps: s.reps,
            weightKg: s.weightKg ?? null,
            rir: s.rir ?? null,
            pain: s.pain === true,
            restSec: s.restSec ?? null,
            notes: s.notes ?? null,
          });
        }
      }
    }
    if (sets.length === 0) {
      Alert.alert("Nothing to save", "Add at least one set with reps.");
      return;
    }
    setBusy(true);
    try {
      await saveWorkout(userId, { name: workoutName, sets });
      setLogging(false);
      await refresh();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteWorkout(id);
    await refresh();
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {logging ? (
          <Card>
            <Field
              label="Workout name"
              value={workoutName}
              onChangeText={setWorkoutName}
            />
            {exercises.map((ex) => (
              <View key={ex.key} style={styles.exerciseBlock}>
                <View style={styles.exerciseHeader}>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Pressable onPress={() => removeExercise(ex.key)} hitSlop={8}>
                    <Ionicons
                      name="close-circle-outline"
                      size={20}
                      color={colors.textDim}
                    />
                  </Pressable>
                </View>
                {/* set header */}
                <View style={styles.setHeaderRow}>
                  <Text style={[styles.setHeaderText, styles.colReps]}>
                    Reps
                  </Text>
                  <Text style={[styles.setHeaderText, styles.colWeight]}>
                    kg
                  </Text>
                  <Text style={[styles.setHeaderText, styles.colRir]}>RIR</Text>
                  <Text style={[styles.setHeaderText, styles.colPain]}>
                    Pain
                  </Text>
                  <View style={styles.colDel} />
                </View>
                {ex.sets.map((s) => (
                  <View key={s.key} style={styles.setRow}>
                    <View style={styles.colReps}>
                      <Field
                        value={s.reps > 0 ? String(s.reps) : ""}
                        onChangeText={(v) =>
                          updateSet(ex.key, s.key, { reps: Number(v) || 0 })
                        }
                        keyboardType="number-pad"
                        style={styles.setInput}
                      />
                    </View>
                    <View style={styles.colWeight}>
                      <Field
                        value={s.weightKg != null ? String(s.weightKg) : ""}
                        onChangeText={(v) =>
                          updateSet(ex.key, s.key, {
                            weightKg: v === "" ? null : Number(v),
                          })
                        }
                        keyboardType="decimal-pad"
                        style={styles.setInput}
                      />
                    </View>
                    <View style={styles.colRir}>
                      <Field
                        value={s.rir != null ? String(s.rir) : ""}
                        onChangeText={(v) =>
                          updateSet(ex.key, s.key, {
                            rir: v === "" ? null : Number(v),
                          })
                        }
                        keyboardType="number-pad"
                        style={styles.setInput}
                      />
                    </View>
                    <View style={styles.colPain}>
                      <Pressable
                        onPress={() =>
                          updateSet(ex.key, s.key, { pain: !s.pain })
                        }
                        style={styles.painToggle}
                      >
                        <Ionicons
                          name={
                            s.pain ? "alert-circle" : "alert-circle-outline"
                          }
                          size={20}
                          color={s.pain ? colors.danger : colors.textDim}
                        />
                      </Pressable>
                    </View>
                    <View style={styles.colDel}>
                      <Pressable
                        onPress={() => removeSet(ex.key, s.key)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name="remove-circle-outline"
                          size={20}
                          color={colors.textDim}
                        />
                      </Pressable>
                    </View>
                  </View>
                ))}
                <Button
                  title="+ Add set"
                  variant="ghost"
                  onPress={() => addSet(ex.key)}
                />
              </View>
            ))}
            <AddExercise onAdd={addExercise} suggestions={exerciseNames} />
            <Button
              title="Finish workout"
              onPress={finishWorkout}
              loading={busy}
            />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setLogging(false)}
            />
          </Card>
        ) : (
          <>
            <Button title="Start workout" onPress={startWorkout} />
            <Card>
              <Text style={styles.cardTitle}>Recent sessions</Text>
              {sessions.length === 0 ? (
                <Text style={styles.dim}>
                  No workouts yet. Start your first one above.
                </Text>
              ) : (
                sessions.map((s) => (
                  <View key={s.id} style={styles.sessionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionName}>{s.name}</Text>
                      <Text style={styles.dim}>
                        {s.date} · {s.sets.length} sets
                        {s.durationMin ? ` · ${s.durationMin} min` : ""}
                      </Text>
                      <Text style={styles.sessionSets} numberOfLines={2}>
                        {summarizeSets(s)}
                      </Text>
                    </View>
                    <Pressable onPress={() => handleDelete(s.id)} hitSlop={8}>
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={colors.textDim}
                      />
                    </Pressable>
                  </View>
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function summarizeSets(s: SessionWithSets): string {
  const byExercise = new Map<string, number>();
  for (const set of s.sets)
    byExercise.set(set.exercise, (byExercise.get(set.exercise) ?? 0) + 1);
  return Array.from(byExercise.entries())
    .map(([name, count]) => `${name} ×${count}`)
    .join(" · ");
}

function AddExercise({
  onAdd,
  suggestions,
}: {
  onAdd: (name: string) => void;
  suggestions: string[];
}) {
  const [value, setValue] = useState("");
  const matches = value.trim()
    ? suggestions
        .filter((n) => n.toLowerCase().includes(value.trim().toLowerCase()))
        .slice(0, 5)
    : [];

  return (
    <View style={{ gap: spacing.xs }}>
      <Field
        label="Add exercise"
        value={value}
        onChangeText={setValue}
        placeholder="e.g. Goblet squat"
      />
      {matches.map((n) => (
        <Pressable
          key={n}
          onPress={() => {
            onAdd(n);
            setValue("");
          }}
          style={styles.suggestion}
        >
          <Text style={styles.suggestionText}>{n}</Text>
        </Pressable>
      ))}
      <Button
        title="Add"
        variant="ghost"
        onPress={() => {
          onAdd(value);
          setValue("");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  cardTitle: { color: colors.text, ...type.heading },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  exerciseBlock: {
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  exerciseName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  setHeaderRow: { flexDirection: "row", gap: spacing.xs, alignItems: "center" },
  setHeaderText: { color: colors.textDim, fontSize: 11, fontWeight: "600" },
  setRow: { flexDirection: "row", gap: spacing.xs, alignItems: "center" },
  setInput: { minHeight: 40, paddingVertical: spacing.xs },
  colReps: { flex: 1 },
  colWeight: { flex: 1 },
  colRir: { flex: 0.8 },
  colPain: { width: 36, alignItems: "center" },
  colDel: { width: 30, alignItems: "center" },
  painToggle: { padding: 4 },
  sessionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "flex-start",
  },
  sessionName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  sessionSets: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  suggestion: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
  },
  suggestionText: { color: colors.text, fontSize: 14 },
});
