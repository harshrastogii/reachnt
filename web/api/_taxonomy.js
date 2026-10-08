// Written by scripts/api_taxonomy.py from config/taxonomy.yaml and config/params.yaml. Do not edit by hand.
// Files starting with "_" are not routes on Vercel; sync.js imports this to check fault ids and categories.
export const CATEGORY = {
 "electrical_danger": "immediate",
 "gas_leak": "immediate",
 "structural_danger": "immediate",
 "sewage_overflow": "immediate",
 "burst_pipe": "immediate",
 "no_water": "urgent",
 "no_power": "urgent",
 "hot_water": "urgent",
 "toilet_blocked": "urgent",
 "shower_broken": "urgent",
 "smoke_alarm": "urgent",
 "security": "urgent",
 "broken_glass": "urgent",
 "roof_leak": "urgent",
 "damp_mould": "urgent",
 "stove_broken": "urgent",
 "aircon_fan": "routine",
 "laundry": "routine",
 "kitchen": "routine",
 "power_point": "routine",
 "pests": "routine",
 "screens_dust": "routine",
 "general": "routine"
};
export const TRADE = {
 "electrical_danger": "electrician",
 "gas_leak": "plumber",
 "structural_danger": "carpenter",
 "sewage_overflow": "plumber",
 "burst_pipe": "plumber",
 "no_water": "plumber",
 "no_power": "electrician",
 "hot_water": "plumber",
 "toilet_blocked": "plumber",
 "shower_broken": "plumber",
 "smoke_alarm": "electrician",
 "security": "carpenter",
 "broken_glass": "carpenter",
 "roof_leak": "carpenter",
 "damp_mould": "general",
 "stove_broken": "electrician",
 "aircon_fan": "aircon",
 "laundry": "plumber",
 "kitchen": "carpenter",
 "power_point": "electrician",
 "pests": "pest",
 "screens_dust": "carpenter",
 "general": "general"
};
// A Tier 1 household (life-preservation) losing one of these is Immediate, whatever the fault's own category.
export const LIFELINE = ["no_power", "no_water", "aircon_fan"];
