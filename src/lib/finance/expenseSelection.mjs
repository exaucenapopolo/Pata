export function toggleExpenseSelectionKey(selectedKeys = [], key) {
  const keys = Array.isArray(selectedKeys) ? selectedKeys : [];
  const normalized = String(key || '');
  if (!normalized) return keys;
  return keys.includes(normalized)
    ? keys.filter((item) => item !== normalized)
    : [...keys, normalized];
}

export function toggleExpenseDayKeys(selectedKeys = [], dayKeys = []) {
  const current = Array.isArray(selectedKeys) ? selectedKeys : [];
  const uniqueDayKeys = [...new Set((Array.isArray(dayKeys) ? dayKeys : []).map((key) => String(key || '')).filter(Boolean))];
  if (!uniqueDayKeys.length) return current;
  const allSelected = uniqueDayKeys.every((key) => current.includes(key));
  return allSelected
    ? current.filter((key) => !uniqueDayKeys.includes(key))
    : [...new Set([...current, ...uniqueDayKeys])];
}

export function getSelectableExpenseDayKeys(items = [], keyById = new Map(), isSelectable = () => true) {
  const keys = [];
  for (const expense of Array.isArray(items) ? items : []) {
    if (!isSelectable(expense)) continue;
    const key = keyById.get(expense.id) || expense.id;
    if (key && !keys.includes(String(key))) keys.push(String(key));
  }
  return keys;
}
