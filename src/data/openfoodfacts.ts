import type { NutritionPer100g } from "@/domain";

/**
 * Open Food Facts barcode lookup.
 *
 * Free, barcode-first, ODbL-licensed. Per their usage policy we do one request
 * per real user scan and cache the result in our own `foods` table so a given
 * barcode is only fetched once.
 *
 * Attribution requirement: surface "Data from Open Food Facts (ODbL)" wherever
 * these results are shown.
 */

const BASE = "https://world.openfoodfacts.org/api/v2/product";

// Identify ourselves per OFF guidelines.
const USER_AGENT = "Adonis/0.1 (personal health tracker)";

export interface OffProduct {
  barcode: string;
  name: string;
  brand?: string;
  per100g: NutritionPer100g;
}

/** A subset of the Open Food Facts nutriments payload we consume. */
interface OffNutriments {
  ["energy-kcal_100g"]?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sodium_100g?: number;
  iron_100g?: number;
  calcium_100g?: number;
  ["vitamin-d_100g"]?: number;
}

/**
 * Look up a product by its barcode. Returns null when not found or when the
 * product lacks usable energy data (caller should fall back to manual entry).
 */
export async function lookupBarcode(
  barcode: string,
): Promise<OffProduct | null> {
  const fields = "product_name,brands,nutriments";
  const res = await fetch(
    `${BASE}/${encodeURIComponent(barcode)}?fields=${fields}`,
    {
      headers: { "User-Agent": USER_AGENT },
    },
  );
  if (!res.ok) return null;

  const json = (await res.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      brands?: string;
      nutriments?: OffNutriments;
    };
  };
  if (json.status !== 1 || !json.product) return null;

  const n = json.product.nutriments ?? {};
  const calories = n["energy-kcal_100g"];
  if (typeof calories !== "number") return null; // no usable data

  return {
    barcode,
    name: json.product.product_name?.trim() || "Unknown product",
    brand: json.product.brands?.split(",")[0]?.trim(),
    per100g: {
      calories,
      protein: n.proteins_100g ?? 0,
      carbs: n.carbohydrates_100g ?? 0,
      fat: n.fat_100g ?? 0,
      fiber: n.fiber_100g,
      // OFF gives sodium in grams/100g; convert to mg for consistency.
      sodium:
        typeof n.sodium_100g === "number" ? n.sodium_100g * 1000 : undefined,
      iron: n.iron_100g,
      calcium: n.calcium_100g,
      vitaminD: n["vitamin-d_100g"],
    },
  };
}
