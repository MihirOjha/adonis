import React, {
  useEffect,
  useState,
  createContext,
  useContext,
  useMemo,
} from "react";
import { applyTheme, colors } from "./theme";

/**
 * Per-user theme. The user's theme_color (a hex string, set by the admin)
 * drives the app BACKGROUND (as a dark tint) and the accent color. It updates
 * the global `colors` object so every screen follows without a per-screen hook.
 */

/** Validate a #RGB / #RRGGBB hex string. */
function isValidHex(v: string | null | undefined): v is string {
  return !!v && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
}

/** Expand #RGB to #RRGGBB and parse to [r,g,b]. */
function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().slice(1);
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Scale a color toward black by `amount` (0 = black, 1 = full color). */
function tint(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(Math.round(r * amount))}${toHex(Math.round(g * amount))}${toHex(Math.round(b * amount))}`;
}

export function ThemeProvider({
  accent,
  children,
}: {
  accent?: string | null;
  children: React.ReactNode;
}) {
  // A version counter that bumps when the theme is applied, forcing a re-render
  // so screens reading the global `colors` object pick up the new values.
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!isValidHex(accent)) {
      applyTheme(null); // reset to defaults
      setVersion((v) => v + 1);
      return;
    }
    const c = accent!.trim();
    applyTheme({
      primary: c,
      bg: tint(c, 0.14), // dark tint of the chosen color
      surface: tint(c, 0.2),
      surfaceAlt: tint(c, 0.26),
    });
    setVersion((v) => v + 1);
  }, [accent]);

  return <>{children}</>;
}

/** Access the live theme colors (the same object screens mutate via applyTheme). */
export function useTheme() {
  return colors;
}
