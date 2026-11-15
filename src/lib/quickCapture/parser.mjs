const EXPENSE_RULES = [
  ["transport", /taxi|moto|bus|transport|essence|carburant|yango|uber|trajet/i],
  ["food", /repas|nourriture|manger|bouffe|restaurant|resto|pain|marché|courses|alimentation|cuisine|boisson/i],
  ["housing", /loyer|maison|logement|eau|électricité|electricite|ménage|réparation/i],
  ["internet", /internet|wifi|forfait|téléphone|telephone|crédit|credit|data|connexion/i],
  ["health", /santé|sante|pharmacie|médicament|medicament|hôpital|hopital|médecin|medecin/i],
  ["leisure", /loisir|cinéma|cinema|jeu|sortie|fête|fete|musique/i],
  ["contribution", /cotisation|tontine|association|mutuelle|offrande/i],
  ["savings", /epargne|economise|mettre de cote/i],
  ["investment", /investissement|placement|crypto|bourse|trading|investir|affaire/i],
];
const INCOME_RULES = [
  ["salary", /salaire|paie|payé par mon employeur|solde de salaire/i],
  ["business", /business|benefice|prestation|freelance/i],
  ["sales", /vente|vendu|vendre|article vendu/i],
  ["commission", /commission|prime|bonus/i],
  ["rental", /loyer recu|location recue|locataire/i],
  ["pension", /pension|allocation/i],
  ["gift", /cadeau|don recu|offert/i],
];
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-CM");
function extractAmount(text) {
  const amountText = String(text || "").replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ");
  const match = amountText.match(/(?:^|\D)(\d{1,3}(?:[ .,'’]\d{3})+|\d{1,10})(?:\s*(?:fcfa|xaf|cfa|francs?))?/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/\D/g, ""));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 1000000000 ? amount : null;
}
function extractDate(text, now) {
  const source = normalize(text);
  if (/\bhier\b/.test(source)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  const explicit = String(text || "").match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (explicit) return explicit[0];
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}
function cleanNote(text) {
  return String(text || "")
    .replace(/\b\d{1,3}(?:[ .,'’]\d{3})+\b|\b\d{1,10}\b/g, " ")
    .replace(/\b(fcfa|xaf|cfa|francs?)\b/gi, " ")
    .replace(/\b(j'ai|jai|je|nous|on|a|aujourd'hui|hier|dépensé|depense|dépense|payé|paye|acheté|achete|reçu|recu|gagné|gagne|encaissé|encaisse|versé|verse|pour|de|du|des|un|une|la|le|les|mon|ma|mes)\b/gi, " ")
    .replace(/[,:;.!?]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}
export function parseQuickCapture(input, now = new Date()) {
  const raw = String(input || "").trim().slice(0, 500);
  const normalized = normalize(raw);
  const amount = extractAmount(raw);
  const income = INCOME_RULES.find(([, pattern]) => pattern.test(normalized));
  const expense = EXPENSE_RULES.find(([, pattern]) => pattern.test(normalized));
  const incomeVerb = /\b(recu|gagne|encaisse|verse|revenu|on m'a envoye|jai recu)\b/.test(normalized);
    const expenseVerb = /\b(depense|depens|paye|achete|achat|sorti|sortie)\b/.test(normalized);
  let type = income ? "income" : expense ? "expense" : null;
  if (incomeVerb) type = "income";
  else if (expenseVerb) type = "expense";
  const categoryId = type === "income"
    ? (income ? income[0] : "other_income")
    : type === "expense"
      ? (expense ? expense[0] : "other")
      : null;
  const note = cleanNote(raw);
  const source = type === "income"
    ? (categoryId === "salary" ? "Salaire" : categoryId === "sales" ? "Vente" : categoryId === "business" ? "Business" : note || "Autre revenu")
    : "";
  const confidence = Math.min(0.99, (amount ? 0.55 : 0) + (type ? 0.25 : 0) + (categoryId ? 0.18 : 0));
  return {
    raw, amount, type,
    categoryId: categoryId || (type === "income" ? "other_income" : type === "expense" ? "other" : null),
    date: extractDate(raw, now), note, source, confidence,
    needsReview: !amount || !type || !categoryId || confidence < 0.8,
  };
}
