/** Minimal shared theme tokens for a consistent look. */
export const colors = {
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
} as const;

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
