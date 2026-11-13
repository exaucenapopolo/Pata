export const CATEGORY_TYPES = Object.freeze(['expense', 'income', 'goal']);
export function normalizeCategoryType(type) {
  return CATEGORY_TYPES.includes(type) ? type : 'expense';
}
