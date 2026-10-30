import { BUDGET_RULES, EXPENSE_CATEGORIES } from './constants';

/**
 * Règles par défaut, au format liste.
 * @returns {{ key: string, label: string, percent: number }[]}
 */
export function getDefaultBudgetRules() {
  return Object.entries(BUDGET_RULES).map(([key, rule]) => ({
    key,
    label: rule.label,
    percent: rule.percent,
  }));
}

/**
 * Fusionne les règles stockées avec les catégories disponibles (defaults + customs).
 * L'utilisateur peut avoir modifié les pourcentages, ou ajouté/supprimé des catégories.
 *
 * @param {Object|null} storedRules - objet { categoryId: percent } venant de Firestore
 * @param {Array} customCategories - catégories custom (expense)
 * @returns {{ key: string, label: string, percent: number }[]}
 */
export function buildRulesList(storedRules, customCategories = []) {
  const base = getDefaultBudgetRules();

  customCategories.forEach((cat) => {
    if (!base.find((r) => r.key === cat.id)) {
      base.push({ key: cat.id, label: cat.name, percent: 0 });
    }
  });

  if (storedRules && typeof storedRules === 'object') {
    return base.map((r) => ({
      ...r,
      percent: storedRules[r.key] !== undefined ? Number(storedRules[r.key]) : r.percent,
    }));
  }

  return base;
}

/**
 * Transforme la liste de règles en objet { key: percent } pour Firestore.
 */
export function rulesToObject(rules) {
  const obj = {};
  rules.forEach((r) => { obj[r.key] = Number(r.percent) || 0; });
  return obj;
}

/**
 * Transforme un revenu mensuel en répartition budgétaire selon les règles.
 *
 * @param {number} monthlyIncome
 * @param {Array} rules - liste { key, label, percent } ; si omis, utilise les défauts
 * @returns {{ key: string, label: string, percent: number, amount: number }[]}
 */
export function computeBudgetBreakdown(monthlyIncome, rules) {
  if (!monthlyIncome || monthlyIncome <= 0) return [];
  const source = rules && rules.length ? rules : getDefaultBudgetRules();
  return source
    .filter((r) => Number(r.percent) > 0)
    .map((r) => ({
      key: r.key,
      label: r.label,
      percent: Number(r.percent) || 0,
      amount: Math.round((monthlyIncome * (Number(r.percent) || 0)) / 100),
    }));
}

/**
 * Vérifie qu'une répartition totalise bien 100 %.
 */
export function validateCustomBudget(allocations) {
  const total = allocations.reduce((s, a) => s + (Number(a.percent) || 0), 0);
  return {
    valid: Math.abs(total - 100) < 0.01,
    total,
    difference: +(100 - total).toFixed(2),
  };
}

/**
 * Calcule le total FCFA alloué par les règles sur un revenu.
 */
export function totalAllocated(monthlyIncome, rules) {
  if (!monthlyIncome || monthlyIncome <= 0) return 0;
  return rules.reduce(
    (s, r) => s + Math.round((monthlyIncome * (Number(r.percent) || 0)) / 100),
    0
  );
}

// Réexport pour compatibilité avec d'anciens imports
export { EXPENSE_CATEGORIES };
