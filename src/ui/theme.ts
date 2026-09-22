/** Minimal shared theme tokens for a consistent look. */
const defaults: Record<string, string> = {
  bg: "#0B0F14",
  surface: "#151B23",
  surfaceAlt: "#1C242E",
  border: "#26303B",
  text: "#E7ECF2",
  textDim: "#9AA7B4",
  primary: "#4CC2FF",
  primaryText: "#04121C",
  success: "#57D9A3",
  warn: "#F2C14E",
  danger: "#F2686C",
};

/**
 * Live theme colors. Screens read `colors.X` directly; the ThemeProvider calls
 * `applyTheme()` when a user's theme_color loads, mutating this object so every
 * screen reflects the user's background/accent without needing a hook per screen.
 */
export const colors = { ...defaults };

/** Apply a per-user theme override (or reset to defaults when null/invalid). */
export function applyTheme(override: Partial<typeof defaults> | null) {
  Object.assign(colors, defaults, override ?? {});
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
} as const;
