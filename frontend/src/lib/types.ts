export type Category = "fresh" | "protein" | "pantry" | "snacks" | "extra";
export type SubstitutePolicy = "brand_alternative" | "size_upgrade" | "do_not_replace";

export interface WarningLabel { code: string; label_he: string }

export interface CartItem {
  gtin: string; name: string; brand: string; category: Category;
  unit_label: string; pack_size: number; pack_unit: string; qty: number;
  list_price: number; unit_price: number; line_total: number; saved: number;
  is_on_promo: boolean; promo_description?: string | null;
  is_club_promo?: boolean; club_id?: string | null;
  bundle_description?: string | null; bundle_hint?: string | null;
  is_sponsored?: boolean; locked?: boolean;
  warning_labels: WarningLabel[]; health_score?: number | null;
  shelf_life_days?: number; substitute_policy?: SubstitutePolicy;
  note?: string | null; source?: string; checked?: boolean;
}

export interface Store {
  id: string; name: string; short: string; delivery_fee: number;
  min_online_order: number; color: string; online_url?: string;
}

export interface Basket {
  store_id: string; store_name: string; target_budget: number; items_total: number;
  delivery: { delivery_fee: number; min_online_order: number; meets_minimum: boolean; included_in_budget: boolean; message_he?: string | null };
  grand_total: number; remaining: number; utilization_pct: number; total_saved: number;
  items: CartItem[];
  breakdown: { category: Category; label_he: string; total: number; pct: number; items: number }[];
  nutrition_summary: Record<string, number>; warnings_count: number;
  filler_suggestions: CartItem[]; message_he?: string | null; seed: number;
}

export interface MealResult {
  recipe_id: string; title: string; emoji: string; servings: number;
  store_id: string; store_name: string; items: CartItem[]; excluded_pantry: string[];
  total: number; per_serving: number; delivery_total: number; saving_vs_delivery: number;
  saving_pct: number; badge_he: string;
  steps: { order: number; title: string; desc: string; duration_min: number; tip?: string }[];
  total_time_min: number; nutrition_per_serving: Record<string, number>;
  quantities: any[]; over_budget: boolean;
}
