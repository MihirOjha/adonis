import { forwardRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { colors, elevation, radius, spacing, type } from "./theme";

/** A titled card container. */
export function Card({
  title,
  children,
  style,
  ...rest
}: ViewProps & { title?: string }) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** Primary/secondary button. */
export function Button({
  title,
  loading,
  variant = "primary",
  style,
  disabled,
  ...rest
}: PressableProps & {
  title: string;
  loading?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) {
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "danger"
        ? colors.danger
        : "transparent";
  const fg = variant === "ghost" ? colors.text : colors.primaryText;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: pressed || disabled ? 0.7 : 1 },
        variant === "ghost" && styles.buttonGhost,
        style as object,
      ]}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Labeled text input. */
export const Field = forwardRef<TextInput, TextInputProps & { label?: string }>(
  function Field({ label, style, ...rest }, ref) {
    return (
      <View style={{ gap: spacing.xs }}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textDim}
          style={[styles.input, style]}
          {...rest}
        />
      </View>
    );
  },
);

/** A big stat number with a caption. */
export function Stat({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...elevation.card,
  },
  cardTitle: {
    color: colors.text,
    ...type.heading,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonGhost: { borderWidth: 1, borderColor: colors.border },
  buttonText: { fontWeight: "700", fontSize: 15, letterSpacing: 0.2 },
  label: { color: colors.textDim, ...type.label },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    minHeight: 48,
  },
  stat: { alignItems: "center", gap: 2, flex: 1 },
  statValue: { color: colors.text, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  statLabel: { color: colors.textDim, ...type.caption },
});
