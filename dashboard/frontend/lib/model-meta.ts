// Optional map from a model's internal id to a human display name.
// Leave entries here if your adapter reports raw ids; otherwise the raw
// string is shown as-is. The bundled demo dataset already uses
// display-ready (synthetic) model names, so this map is empty by default.
export const MODEL_DISPLAY_NAMES: Record<string, string> = {}

export function modelDisplayName(model: string): string {
  return MODEL_DISPLAY_NAMES[model] ?? model
}
