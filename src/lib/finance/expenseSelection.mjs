import { getExpenseOperationKeys } from './expenseOperations.mjs';

export function isBulkSelectableExpense(expense) {
  return Boolean(expense)
    && expense.neutralFlow !== true
    && expense.cashWithdrawal !== true
    && !expense.debtId
    && !expense.repaymentDebtId
    && expense.flowType !== 'loan_given';
}

export function getExpenseSelectionKey(expense, keyById = new Map()) {
  if (!expense?.id) return '';
  return String(keyById.get(expense.id) || expense.id);
}

export function toggleExpenseSelectionKey(selectedKeys = [], key) {
  const normalizedKey = String(key || '');
  if (!normalizedKey) return Array.isArray(selectedKeys) ? selectedKeys : [];
  const current = Array.isArray(selectedKeys) ? selectedKeys : [];
  return current.includes(normalizedKey)
    ? current.filter((item) => item !== normalizedKey)
    : [...current, normalizedKey];
}

export function getDayExpenseSelectionKeys(items = [], keyById = new Map()) {
  return [...new Set((Array.isArray(items) ? items : [])
    .filter(isBulkSelectableExpense)
    .map((expense) => getExpenseSelectionKey(expense, keyById))
    .filter(Boolean))];
}

export function toggleDayExpenseSelectionKeys(selectedKeys = [], dayKeys = []) {
  const current = Array.isArray(selectedKeys) ? selectedKeys : [];
  const uniqueDayKeys = [...new Set((Array.isArray(dayKeys) ? dayKeys : []).map((key) => String(key || '')).filter(Boolean))];
  if (!uniqueDayKeys.length) return current;
  const allSelected = uniqueDayKeys.every((key) => current.includes(key));
  return allSelected
    ? current.filter((key) => !uniqueDayKeys.includes(key))
    : [...new Set([...current, ...uniqueDayKeys])];
}

/**
 * Resolve checked expense rows into accounting operations. Shared-expense
 * funding rows are returned once with all their allocations and one root ID.
 * An unmapped key falls back to the original expense ID so the selection bar
 * cannot silently disappear for a single normal expense.
 */
export function getSelectedExpenseOperations(expenses = [], selectedKeys = []) {
  const rows = Array.isArray(expenses) ? expenses : [];
  const selected = [...new Set((Array.isArray(selectedKeys) ? selectedKeys : []).map((key) => String(key || '')).filter(Boolean))];
  if (!selected.length) return [];

  const operationKeys = getExpenseOperationKeys(rows);
  const grouped = new Map();
  rows.forEach((expense, index) => {
    const key = String(operationKeys[index] || expense?.id || '');
    if (!key) return;
    const operationRows = grouped.get(key) || [];
    operationRows.push(expense);
    grouped.set(key, operationRows);
  });

  return selected.map((key) => {
    const operationRows = grouped.get(key)
      || rows.filter((expense) => String(expense?.id || '') === key);
    const root = operationRows.find((expense) => String(expense?.id || '') === key)
      || operationRows[0]
      || null;
    if (!root || !operationRows.length || !operationRows.every(isBulkSelectableExpense)) return null;
    return {
      key,
      root,
      rows: operationRows,
      amount: operationRows.reduce((sum, expense) => sum + Math.max(0, Number(expense?.amount) || 0), 0),
    };
  }).filter(Boolean);
}

// Names consumed by the expenses screen.
export const getSelectableExpenseDayKeys = getDayExpenseSelectionKeys;
export const toggleExpenseDayKeys = toggleDayExpenseSelectionKeys;
