import React, { createContext, useContext, useMemo } from "react";
import { colors as base } from "./theme";

/**
 * Per-user theme. The accent/primary color can be overridden per user (stored
 * on profiles.theme_color as a hex string). Everything else stays on the
 * default dark palette. If unset/invalid, the default primary is used.
 */

// Widen the literal `as const` types to plain strings so the accent can be
// overridden with any hex value.
export type ThemeColors = { [K in keyof typeof base]: string };

const ThemeContext = createContext<ThemeColors>(base);

/** Validate a #RGB / #RRGGBB hex string. */
function isValidHex(v: string | null | undefined): v is string {
  return !!v && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
}

export function ThemeProvider({
  accent,
  children,
}: {
  accent?: string | null;
  children: React.ReactNode;
}) {
  const value = useMemo<ThemeColors>(() => {
    if (!isValidHex(accent)) return base;
    const c = accent!.trim();
    return { ...base, primary: c };
  }, [accent]);
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Access the active theme colors (respects the per-user accent override). */
export function useTheme(): ThemeColors {
  return useContext(ThemeContext);
}
