-- Adonis — store the food's label reference amount (serving size)
-- Run after 0005_muse_api_v2.sql.
--
-- Foods were stored strictly per-100g, forcing users to convert label values
-- by hand. Now a food carries serving_size_g = the reference weight the label
-- values are given for (e.g. "per 50 g", "per 1 serving = 30 g"). The stored
-- calories/protein/carbs/fat are the values FOR that serving_size_g. Logging
-- scales from serving_size_g to the grams eaten. Default 100 keeps existing
-- rows behaving exactly as before (per-100g).

alter table foods
  add column if not exists serving_size_g numeric(8, 1) not null default 100 check (serving_size_g > 0);
