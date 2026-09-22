import type { Macros } from "@/domain";

/**
 * USDA FoodData Central — text search for generic/whole foods and common
 * packaged items. Free public-domain US government database. Complements Open
 * Food Facts (which is barcode-first) with strong text search.
 *
 * Requires a free API key (EXPO_PUBLIC_USDA_API_KEY). Get one at
 * https://fdc.nal.usda.gov/api-key-signup.html — "DEMO_KEY" works for light use.
 */

const BASE = "https://api.nal.usda.gov/fdc/v1/foods/search";

export interface UsdaFoodResult {
  fdcId: number;
  description: string;
  brand?: string;
  /** Nutrition per 100 g (USDA reports per 100 g). */
  per100g: { calories: number } & Macros;
}

interface UsdaNutrient {
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

function pick(nutrients: UsdaNutrient[], name: string): number {
  const n = nutrients.find(
    (x) => x.nutrientName?.toLowerCase() === name.toLowerCase(),
  );
  return typeof n?.value === "number" ? n.value : 0;
}

/** Search USDA for foods matching a text query. Returns [] if no key or no hit. */
export async function searchUsda(
  query: string,
  apiKey: string,
  limit = 15,
): Promise<UsdaFoodResult[]> {
  if (!query.trim() || !apiKey) return [];
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query.trim(),
        api_key: apiKey,
        pageSize: limit,
        // Prefer branded + foundation + SR legacy for the best coverage.
        dataType: ["Branded", "Foundation", "SR Legacy", "Survey (FNDDS)"],
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      foods?: Array<{
        fdcId?: number;
        description?: string;
        brandOwner?: string;
        foodNutrients?: UsdaNutrient[];
      }>;
    };
    return (json.foods ?? [])
      .map((f) => {
        const nuts = f.foodNutrients ?? [];
        const calories = pick(nuts, "Energy");
        return {
          fdcId: f.fdcId ?? 0,
          description: f.description?.trim() || "Unknown",
          brand: f.brandOwner?.trim(),
          per100g: {
            calories,
            protein: pick(nuts, "Protein"),
            carbs: pick(nuts, "Carbohydrate, by difference"),
            fat: pick(nuts, "Total lipid (fat)"),
          },
        };
      })
      .filter((f) => f.per100g.calories > 0);
  } catch {
    return [];
  }
}
