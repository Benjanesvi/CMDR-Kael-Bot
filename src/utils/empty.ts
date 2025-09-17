// src/utils/empty.ts
// Simple helper to check for empty arrays/objects
export function empty(val: any): boolean {
  if (!val) return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === "object") return Object.keys(val).length === 0;
  return false;
}
