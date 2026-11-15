const EXPENSE_RULES = [
  ["transport", /taxi|moto|bus|transport|essence|carburant|yango|uber|trajet|parking|péage/i],
  ["food", /repas|nourriture|manger|bouffe|restaurant|resto|pain|marché|courses|alimentation|cuisine|boisson|eau à boire/i],
  ["housing", /loyer|maison|logement|eau|électricité|electricite|ménage|réparation|gaz|ménagère/i],
  ["internet", /internet|wifi|forfait|téléphone|telephone|crédit|credit|data|connexion|mtn|orange money/i],
  ["health", /santé|sante|pharmacie|médicament|medicament|hôpital|hopital|médecin|medecin|soin/i],
  ["leisure", /loisir|cinéma|cinema|jeu|sortie|fête|fete|musique|sport/i],
  ["contribution", /cotisation|tontine|association|mutuelle|offrande/i],
  ["savings", /epargne|economise|mettre de cote|économi/i],
  ["investment", /investissement|placement|crypto|bourse|trading|investir|affaire/i],
  ["gift_donation", /cadeau|don|offrande|charité|charite/i],
];
const INCOME_RULES = [
  ["salary", /salaire|paie|payé par mon employeur|solde de salaire/i],
  ["business", /business|benefice|prestation|freelance|service vendu/i],
  ["sales", /vente|vendu|vendre|article vendu/i],
  ["commission", /commission|prime|bonus/i],
  ["rental", /loyer recu|location recue|locataire/i],
  ["pension", /pension|allocation/i],
  ["gift", /cadeau recu|don recu|offert/i],
];
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-CM");
const pad = (value) => String(value).padStart(2, "0");
function dateFromRelative(token, now) {
  const date = new Date(now);
  const value = normalize(token);
  if (/\bdemain\b/.test(value)) date.setDate(date.getDate() + 1);
  else if (/\bhier\b/.test(value)) date.setDate(date.getDate() - 1);
  else if (/\bapres demain\b/.test(value)) date.setDate(date.getDate() + 2);
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}
function dateTokenValue(token, now) {
  const value = String(token || "").match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (value) {
    const date = new Date(value[0] + "T00:00:00.000Z");
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value[0]) return value[0];
    return null;
  }
  return dateFromRelative(token, now);
}
function extractDate(text, now) {
  const raw = String(text || "").replace(/(?:echeance|échéance|à rendre|a rendre|avant le|date limite|a payer le|à payer le|pour le)\s*(?:le|du)?\s*[:]?\s*(20\d{2}-\d{2}-\d{2}|demain|hier|apres[- ]demain)/i, " ");
  const labeled = raw.match(/(?:date|le|du)\s*[:]?\s*(20\d{2}-\d{2}-\d{2}|demain|hier|apres[- ]demain)/i)
    || raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (labeled) {
    const value = dateTokenValue(labeled[1] || labeled[0], now);
    if (value) return value;
  }
  const relative = normalize(raw).match(/\b(apres demain|demain|hier)\b/);
  if (relative) return dateFromRelative(relative[0], now);
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
}
function extractDueDate(text, now) {
  const raw = String(text || "");
  const match = raw.match(/(?:echeance|échéance|à rendre|a rendre|avant le|date limite|a payer le|à payer le|pour le)\s*(?:le|du)?\s*[:]?\s*(20\d{2}-\d{2}-\d{2}|demain|hier|apres[- ]demain)/i);
  return match ? dateTokenValue(match[1], now) : null;
}
function extractAmount(text) {
  const amountText = String(text || "").replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ");
  const match = amountText.match(/(?:^|\D)(\d{1,3}(?:[ .,'’]\d{3})+|\d{1,10})(?:\s*(?:fcfa|xaf|cfa|francs?))?/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/\D/g, ""));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 1000000000 ? amount : null;
}
function stripAmountsAndDates(value) {
  return String(value || "")
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,3}(?:[ .,'’]\d{3})+\b|\b\d{1,10}\b/g, " ")
    .replace(/\b(fcfa|xaf|cfa|francs?)\b/gi, " ")
    .replace(/\b(demain|hier|apres demain|echeance|échéance|date limite|a rendre|avant le|date|le|du|pour le|a payer le)\b/gi, " ")
    .replace(/[,:;.!?]/g, " ").replace(/\s+/g, " ").trim();
}
function extractCounterparty(text, type) {
  let value = String(text || "");
  value = value
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,3}(?:[ .,'’]\d{3})+\b|\b\d{1,10}\b/g, " ")
    .replace(/(?:echeance|échéance|date limite|à rendre|a rendre|avant le|a payer le|à payer le|pour le)\s*(?:le|du)?\s*[:]?\s*(20\d{2}-\d{2}-\d{2}|demain|hier|apres[- ]demain)?/gi, " ");
  value = normalize(value)
    .replace(/\b(j'ai|jai|je|nous|on|ai|contracte|contracter|pris|prends|dois|doit|pret|prets|prete|preter|dette|dettes|emprunt|emprunte|emprunter|argent|fcfa|echeance|date|limite|rendre|avant|payer|demain|hier|apres|aujourd'hui)\b/gi, " ")
    .replace(/\b(une|un|de|du|des|chez|aupres|a|pour|la|le|les|mon|ma|mes|moi|lui|elle|il|me|te|se|son|sa|ses)\b/gi, " ")
    .replace(/[^a-z0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return "";
  const tokens = value.split(" ").filter(Boolean);
  const name = tokens.slice(-4).join(" ").slice(0, 100);
  return name ? name.charAt(0).toLocaleUpperCase("fr-FR") + name.slice(1) : "";
}
function cleanNote(text) {
  return String(text || "")
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,3}(?:[ .,'’]\d{3})+\b|\b\d{1,10}\b/g, " ")
    .replace(/\b(fcfa|xaf|cfa|francs?)\b/gi, " ")
    .replace(/\b(j'ai|jai|je|nous|on|a|aujourd'hui|demain|hier|dépensé|depense|dépense|payé|paye|acheté|achete|reçu|recu|gagné|gagne|encaissé|encaisse|versé|verse|pour|de|du|des|un|une|la|le|les|mon|ma|mes|revenu|facture|pret|prêt|dette|echeance|échéance)\b/gi, " ")
    .replace(/[,:;.!?]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}
function extractIncomeSource(raw, categoryId, incomeMatch) {
  let value = String(raw || "");
  value = value.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,3}(?:[ .,'’]\d{3})+\b|\b\d{1,10}\b/g, " ")
    .replace(/\b(fcfa|xaf|cfa|francs?)\b/gi, " ")
    .replace(/\b(revenu|recette|recu|reçu|reçue|j'ai|jai|je|on|a|de|du|des|par|pour|un|une|le|la|les|mon|ma|mes|hier|demain|date)\b/gi, " ");
  if (incomeMatch) value = value.replace(incomeMatch[1], " ");
  value = value.replace(/\b(salaire|paie|business|benefice|bénéfice|prestation|freelance|vente|vendu|vendre|commission|prime|bonus|loyer|location|locataire|pension|allocation|cadeau|don)\b/gi, " ");
  value = value.replace(/[,:;.!?]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  if (value) return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1);
  const labels = { salary: "Salaire", business: "Business", sales: "Vente", commission: "Commission", rental: "Loyer reçu", pension: "Pension", gift: "Don reçu" };
  return labels[categoryId] || "Autre revenu";
}
function extractBillDetails(raw, normalized) {
  const billRules = [
    ["electricity", /electricite|enedis|eneo|sonel/i, "housing", "Électricité"],
    ["water", /facture d'eau|eau|camwater/i, "housing", "Eau"],
    ["rent", /loyer|location/i, "housing", "Loyer"],
    ["television", /canal\+?|tv|television|tnt/i, "internet", "Télévision"],
    ["internet", /internet|wifi|fibre|box/i, "internet", "Internet"],
    ["telephone", /telephone|credit|forfait|mtn|orange/i, "internet", "Téléphone"],
    ["taxes", /impot|taxe|impots/i, "other", "Impôts"],
    ["insurance", /assurance|assureur/i, "other", "Assurance"],
    ["school", /ecole|scolarite|universite|frais scolaires/i, "other", "Scolarité"],
  ];
  const match = billRules.find(([, pattern]) => pattern.test(normalized));
  const frequency = /hebdomadaire|chaque semaine|par semaine/i.test(normalized) ? "weekly"
    : /trimestriel|chaque trimestre/i.test(normalized) ? "quarterly"
    : /annuel|chaque annee|par an/i.test(normalized) ? "yearly"
    : /mensuel|chaque mois|par mois/i.test(normalized) ? "monthly" : null;
  if (!match) return { billType: "other", expenseCategoryId: "other", billName: "Facture à préciser", frequency };
  return { billType: match[0], expenseCategoryId: match[1], billName: "Facture " + match[3], frequency };
}
export function parseQuickCapture(input, now = new Date()) {
  const raw = String(input || "").trim().slice(0, 500);
  const normalized = normalize(raw);
  const amount = extractAmount(raw);
  const hasBill = /\bfacture\b|\bfactures\b/.test(normalized);
  const hasLoan = /\bpret\b|\bprets\b|\bprete\b|\bpretee\b|\bpretes\b/.test(normalized);
  const hasDebt = /\bdette\b|\bdettes\b|\bemprunt\b|\bemprunte\b|\bemprunter\b/.test(normalized);
  const explicitDate = raw.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  const dueDate = extractDueDate(raw, now)
    || ((hasBill || hasLoan || hasDebt) && explicitDate ? dateTokenValue(explicitDate[0], now) : null);
  const income = INCOME_RULES.find(([, pattern]) => pattern.test(normalized));
  const expense = EXPENSE_RULES.find(([, pattern]) => pattern.test(normalized));
  const incomeVerb = /\b(recu|gagne|encaisse|verse|revenu|recette|on m'a envoye|jai recu)\b/.test(normalized);
  const expenseVerb = /\b(depense|depens|paye|achete|achat|sorti|sortie)\b/.test(normalized);
  let type = null;
  if (hasBill) type = "bill";
  else if (hasLoan) type = "loan_given";
  else if (hasDebt) type = "debt_borrowed";
  else if (income || incomeVerb) type = "income";
  else if (expense || expenseVerb || (amount && cleanNote(raw))) type = "expense";

  const bill = hasBill ? extractBillDetails(raw, normalized) : null;
  const categoryId = type === "income"
    ? (income ? income[0] : "other_income")
    : type === "expense"
      ? (expense ? expense[0] : "other")
      : type === "bill" ? bill.expenseCategoryId
      : type === "loan_given" ? "loan_given"
      : type === "debt_borrowed" ? "debt_borrowed" : null;
  const person = type === "loan_given" || type === "debt_borrowed"
    ? extractCounterparty(raw, type) : "";
  const note = cleanNote(raw);
  const source = type === "income" ? extractIncomeSource(raw, categoryId, income?.[1]) : "";
  const confidence = Math.min(0.99, (amount ? 0.55 : 0) + (type ? 0.25 : 0) + (categoryId ? 0.18 : 0));
  const missingRequiredDetail = (type === "loan_given" || type === "debt_borrowed") && !person;
  const needsReview = (type !== "bill" && (!amount || !type || !categoryId || missingRequiredDetail))
    || (!type && !amount);
  return {
    raw, amount, type, categoryId,
    date: (hasBill || hasLoan || hasDebt) && dueDate ? (now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate())) : extractDate(raw, now),
    dueDate,
    note, source, person, confidence,
    billName: bill?.billName || "", billType: bill?.billType || "",
    expenseCategoryId: bill?.expenseCategoryId || "",
    frequency: bill?.frequency || null,
    isVariable: type === "bill" && !amount,
    needsReview,
  };
}
