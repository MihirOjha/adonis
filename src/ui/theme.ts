/** Minimal shared theme tokens for a consistent look. */
const defaults: Record<string, string> = {
  // Refined dark palette — deep neutral base, subtle elevation, one accent.
  bg: "#0E1116",
  surface: "#161B22",
  surfaceAlt: "#1D242E",
  border: "#2A323D",
  text: "#EDF1F6",
  textDim: "#98A3B0",
  primary: "#5B8DEF",
  primaryText: "#0A1220",
  success: "#4CC38A",
  warn: "#E5B567",
  danger: "#E5636C",
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
  sm: 10,
  md: 14,
  lg: 22,
} as const;

/** Typography scale for a more polished, consistent look. */
export const type = {
  title: { fontSize: 24, fontWeight: "800" as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  label: { fontSize: 13, fontWeight: "600" as const },
  caption: { fontSize: 12, fontWeight: "400" as const },
} as const;

/** Subtle elevation via shadow (native) / box-shadow (web). */
export const elevation = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;
