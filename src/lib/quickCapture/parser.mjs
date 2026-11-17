const EXPENSE_RULES = [
  ["transport", /taxi|moto|mototaxi|bus|transport|essence|carburant|yango|uber|trajet|parking|peage|billet|voyage|deplacement/i,
    ["transport", "taxi", "mototaxi", "moto", "bus", "car", "voiture", "essence", "carburant", "petrole", "gasoil", "diesel", "parking", "peage", "ticket", "billet", "voyage", "deplacement", "course", "taxi moto"]],
  ["food", /repas|nourriture|manger|bouffe|restaurant|resto|pain|marche|courses|alimentation|cuisine|boisson|dejeuner|diner|petit.?dejeuner|gouter|collation|provisions|epicerie|snack/i,
    ["repas", "nourriture", "manger", "mange", "bouffe", "restaurant", "resto", "pain", "marche", "courses", "alimentation", "cuisine", "boisson", "eau a boire", "dejeuner", "diner", "petit dejeuner", "gouter", "collation", "provisions", "epicerie", "snack", "aliments", "alimentaire", "viande", "poisson", "legumes", "fruits", "petit repas", "repas du soir", "repas de midi"]],
  ["housing", /loyer|maison|logement|eau|electricite|menage|reparation|gaz|quittance|plomberie|peinture|construction/i,
    ["loyer", "maison", "logement", "eau", "electricite", "eneo", "sonel", "camwater", "menage", "reparation", "gaz", "plomberie", "peinture", "construction", "habitation", "domicile", "maisonnement"]],
  ["internet", /internet|wifi|forfait|telephone|credit|data|connexion|mtn|orange money|megabytes|mega|appel/i,
    ["internet", "wifi", "forfait", "telephone", "credit", "data", "connexion", "mtn", "orange", "megabytes", "mega", "appel", "communication", "abonnement mobile"]],
  ["health", /sante|pharmacie|medicament|hopital|medecin|soin|clinique|consultation|ordonnance|laboratoire/i,
    ["sante", "pharmacie", "medicament", "hopital", "medecin", "soin", "clinique", "consultation", "ordonnance", "laboratoire", "analyse medicale", "traitement"]],
  ["leisure", /loisir|cinema|jeu|sortie|fete|musique|sport|divertissement|bar|voyage de loisir/i,
    ["loisir", "cinema", "jeu", "sortie", "fete", "musique", "sport", "divertissement", "bar", "spectacle", "detente", "football"]],
  ["contribution", /cotisation|tontine|association|mutuelle|offrande|participation commune/i,
    ["cotisation", "tontine", "association", "mutuelle", "offrande", "participation", "contribution", "mise en commun"]],
  ["savings", /epargne|economise|mettre de cote|economi|depot epargne/i,
    ["epargne", "economiser", "economise", "mettre de cote", "argent de cote", "depot epargne", "mise de cote"]],
  ["investment", /investissement|placement|crypto|bourse|trading|investir|affaire|capital investi/i,
    ["investissement", "placement", "crypto", "bourse", "trading", "investir", "affaire", "capital", "business investi"]],
  ["gift_donation", /cadeau|don|offrande|charite|aumone|present/i,
    ["cadeau", "don", "offrande", "charite", "aumone", "present", "cadeau offert"]],
];
const INCOME_RULES = [
  ["salary", /salaire|paie|remuneration|appointement|traitement|solde de salaire/i,
    ["salaire", "paie", "remuneration", "appointement", "appointements", "traitement", "paye mensuelle", "salaire mensuel"]],
  ["business", /business|benefice|profit|prestation|freelance|service vendu|honoraire|chiffre d.?affaire/i,
    ["business", "benefice", "profit", "prestation", "freelance", "service vendu", "honoraire", "honoraires", "chiffre affaire", "chiffre d'affaire", "activite", "mission payee"]],
  ["sales", /vente|vendu|vendre|article vendu|marchandise vendue|produit vendu/i,
    ["vente", "ventes", "vendu", "vendue", "vendre", "marchandise", "article vendu", "produit vendu", "recette vente"]],
  ["commission", /commission|prime|bonus|pourcentage touche/i,
    ["commission", "prime", "bonus", "pourcentage", "gratification", "indemnite"]],
  ["rental", /loyer recu|location recue|locataire|revenu locatif/i,
    ["loyer recu", "location recue", "locataire", "revenu locatif", "location"]],
  ["pension", /pension|allocation|retraite|bourse scolaire/i,
    ["pension", "allocation", "retraite", "bourse scolaire", "aide sociale"]],
  ["gift", /cadeau recu|don recu|offert|argent offert/i,
    ["cadeau recu", "don recu", "offert", "argent offert", "cadeau", "don"]],
];
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'").toLocaleLowerCase("fr-CM");
const pad = (value) => String(value).padStart(2, "0");
const MONTHS = {
  janvier: 1, janv: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4,
  mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9,
  octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12,
};
const WEEKDAYS = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};
const INCOME_INTENT_ALIASES = [
  "revenu", "revenus", "revenue", "revenues", "recette", "recettes",
  "rentree d'argent", "rentre d'argent", "argent recu", "entree d'argent",
];

function isValidCalendarDate(year, month, day) {
  const value = String(year) + "-" + pad(month) + "-" + pad(day);
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
function dateFromRelative(token, now) {
  const date = new Date(now);
  const value = normalize(token);
  if (/\bavant[- ]hier\b/.test(value)) date.setDate(date.getDate() - 2);
  else if (/\b(apres demain|apres-demain)\b/.test(value)) date.setDate(date.getDate() + 2);
  else if (/\bdemain\b/.test(value)) date.setDate(date.getDate() + 1);
  else if (/\bhier\b/.test(value)) date.setDate(date.getDate() - 1);
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}
function dateFromWeekday(token, now) {
  const value = normalize(token);
  const match = value.match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/);
  if (!match) return null;
  const target = WEEKDAYS[match[1]];
  const todayKey = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  const base = new Date(todayKey + "T12:00:00.000Z");
  const current = base.getUTCDay();
  const wantsFuture = /\b(prochain|prochaine|qui vient)\b/.test(value);
  const explicitlyPast = /\b(dernier|derniere|passe|passee)\b/.test(value);
  let offset = wantsFuture ? (target - current + 7) % 7 : (current - target + 7) % 7;
  if ((wantsFuture || explicitlyPast) && offset === 0) offset = 7;
  base.setUTCDate(base.getUTCDate() + (wantsFuture ? offset : -offset));
  return base.toISOString().slice(0, 10);
}
function dateTokenValue(token, now) {
  const raw = normalize(token).trim();
  const iso = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return isValidCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = raw.match(/\b([0-3]?\d)[/.\-]([01]?\d)(?:[/.\-](20\d{2}))?\b/);
  if (slash) return isValidCalendarDate(Number(slash[3] || now.getFullYear()), Number(slash[2]), Number(slash[1]));
  const monthFirst = raw.match(/\b(\d{1,2})(?:er)?\s+(janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)(?:\s+(20\d{2}))?\b/);
  if (monthFirst) return isValidCalendarDate(Number(monthFirst[3] || now.getFullYear()), MONTHS[monthFirst[2]], Number(monthFirst[1]));
  const dayFirst = raw.match(/\b(janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\s+(\d{1,2})(?:\s+(20\d{2}))?\b/);
  if (dayFirst) return isValidCalendarDate(Number(dayFirst[3] || now.getFullYear()), MONTHS[dayFirst[1]], Number(dayFirst[2]));
  const dayOnly = raw.match(/^(?:le|du)\s+([0-3]?\d)$/);
  if (dayOnly) return isValidCalendarDate(now.getFullYear(), now.getMonth() + 1, Number(dayOnly[1]));
  if (/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(raw)) return dateFromWeekday(raw, now);
  if (/\b(avant[- ]hier|demain|hier|apres demain|apres-demain)\b/.test(raw)) return dateFromRelative(raw, now);
  if (/\baujourd'hui\b|\baujourd hui\b/.test(raw)) return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  return null;
}
function extractDateTokens(text, now) {
  const raw = String(text || "");
  const patterns = [
    /\b20\d{2}-\d{1,2}-\d{1,2}\b/gi,
    /\b[0-3]?\d[/.\-][01]?\d(?:[/.\-]20\d{2})?\b/gi,
    /\b\d{1,2}(?:er)?\s+(?:janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)(?:\s+20\d{2})?\b/gi,
    /\b(?:janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\s+\d{1,2}(?:\s+20\d{2})?\b/gi,
    /\b(?:le|du)\s+[0-3]?\d\b/gi,
    /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+(?:dernier|derniere|passe|passee|prochain|prochaine))?\b/gi,
    /\bavant[- ]hier\b|\bapres[- ]demain\b|\bdemain\b|\bhier\b|\baujourd'hui\b/gi,
  ];
  const matches = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(raw)) !== null) {
      const value = dateTokenValue(match[0], now);
      if (value && !matches.some((item) => item.start === match.index)) {
        matches.push({ value, start: match.index, end: match.index + match[0].length, raw: match[0] });
      }
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}
function extractDate(text, now) {
  const tokens = extractDateTokens(text, now);
  const value = tokens[0]?.value;
  return value || (now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()));
}
function extractDueDate(text, now, hasBill, hasLoan, hasDebt) {
  const raw = String(text || "");
  const tokens = extractDateTokens(raw, now);
  if (!tokens.length) return null;
  const normalized = normalize(raw);
  const dueLabel = /(?:echeance|a rendre|a rembourser|avant le|date limite|a payer|payer avant|rendre avant|pour le|a regler|regler avant|a acquitter|acquitter avant)/;
  const explicitDateLabels = /(?:date de (?:transaction|l'operation|operation|paiement|l'achat|achat)|date (?:de )?(?:transaction|paiement|achat)|effectue le|operation du|transaction du)/;
  const explicitDue = normalized.match(/(?:echeance|a rendre|a rembourser|avant le|date limite|a payer|payer avant|rendre avant|pour le|a regler|regler avant|a acquitter|acquitter avant)[^\d]{0,24}((?:20\d{2}-\d{1,2}-\d{1,2})|(?:[0-3]?\d[/.\-][01]?\d(?:[/.\-]20\d{2})?)|(?:\d{1,2}(?:er)?\s+(?:janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)(?:\s+20\d{2})?)|(?:demain|hier|apres[- ]demain))/);
  if (explicitDue) {
    const date = dateTokenValue(explicitDue[1], now);
    if (date) return date;
  }
  if (explicitDateLabels.test(normalized)) return null;
  if (hasBill) return tokens[0].value;
  if (hasLoan || hasDebt) {
    const relativeOperationDate = /\b(avant[- ]hier|hier|aujourd'hui|demain|apres[- ]demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(normalized)
      || /^\s*(?:le|du)\s+[0-3]?\d\b/i.test(raw);
    if (relativeOperationDate && !dueLabel.test(normalized)) return null;
    return tokens[0].value;
  }
  if (dueLabel.test(normalized)) return tokens[0].value;
  return null;
}
function extractAmount(text) {
  const amountText = String(text || "")
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/\b[0-3]?\d[/.\-][01]?\d(?:[/.\-]20\d{2})?\b/g, " ")
    .replace(/\b\d{1,2}(?:er)?\s+(?:janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)(?:\s+20\d{2})?\b/gi, " ")
    .replace(/\b(?:janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\s+\d{1,2}(?:\s+20\d{2})?\b/gi, " ")
    .replace(/\b(?:le|du)\s+[0-3]?\d\b/gi, " ")
    .replace(/\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+(?:dernier|derniere|passe|passee|prochain|prochaine))?\b/gi, " ")
    .replace(/\b(?:avant[- ]hier|apres[- ]demain|demain|hier|aujourd'hui)\b/gi, " ");
  const match = amountText.match(/(?:^|\D)(\d{1,3}(?:[ .,'’]\d{3})+|\d{1,10})(?:\s*(?:fcfa|xaf|cfa|francs?|euros?|eur|eru))?/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/\D/g, ""));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 1000000000 ? amount : null;
}
function stripAmountsAndDates(value) {
  return String(value || "")
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/\b[0-3]?\d[/.\-][01]?\d(?:[/.\-]20\d{2})?\b/g, " ")
    .replace(/\b\d{1,3}(?:[ .,'’]\d{3})+\b|\b\d{1,10}\b/g, " ")
    .replace(/\b(fcfa|xaf|cfa|francs?|euros?|eur|eru)\b/gi, " ")
    .replace(/\b(demain|hier|apres demain|echeance|date limite|a rendre|avant le|date|le|du|pour le|a payer le)\b/gi, " ")
    .replace(/[,:;.!?]/g, " ").replace(/\s+/g, " ").trim();
}
function editDistanceAtMostOne(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    edits++;
    if (edits > 1) return false;
    if (left.length > right.length) i++;
    else if (right.length > left.length) j++;
    else { i++; j++; }
  }
  if (i < left.length || j < right.length) edits++;
  return edits <= 1;
}
function hasAlias(text, alias) {
  const value = normalize(text);
  const target = normalize(alias);
  if (!target) return false;
  if (target.includes(" ")) return new RegExp("(^|[^a-z0-9])" + target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+") + "($|[^a-z0-9])").test(value);
  if (new RegExp("(^|[^a-z0-9])" + target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-z0-9])").test(value)) return true;
  if (target.length < 6) return false;
  return value.split(/[^a-z0-9]+/).some((token) => token.length >= 6 && editDistanceAtMostOne(token, target));
}
function matchesRules(text, rule) {
  const [, pattern, aliases] = rule;
  return pattern.test(text) || (aliases || []).some((alias) => hasAlias(text, alias));
}
function removeAliasFromText(value, target) {
  const normalized = normalize(value);
  const escaped = target.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const exact = new RegExp("(^|[^a-z0-9])" + escaped + "($|[^a-z0-9])", "i");
  const match = exact.exec(normalized);
  if (match) {
    const start = match.index + match[1].length;
    const prefix = value.slice(0, start).replace(/\\b(?:au|aux|a|de|du|des|la|le|les|chez|pour)\\s*$/i, "");
    return prefix + " " + value.slice(start + target.length);
  }
  if (!target.includes(" ") && target.length >= 6) {
    const words = /[a-z0-9]+/g;
    let word;
    while ((word = words.exec(normalized)) !== null) {
      if (editDistanceAtMostOne(word[0], target)) {
        return value.slice(0, word.index) + " " + value.slice(word.index + word[0].length);
      }
    }
  }
  return value;
}
function stripAliasTerms(text, aliases = [], beforeAmountOnly = false) {
  const original = String(text || "");
  const amountMatch = /(?:^|\D)(\d{1,3}(?:[ .,'’]\d{3})+|\d{1,10})/.exec(original);
  const amountStart = amountMatch ? amountMatch.index + amountMatch[0].length - amountMatch[1].length : original.length;
  let before = original.slice(0, amountStart);
  const after = original.slice(amountStart);
  let matchedBeforeAmount = false;
  for (const alias of aliases) {
    const target = normalize(alias);
    if (target && hasAlias(before, target)) {
      before = removeAliasFromText(before, target);
      matchedBeforeAmount = true;
    }
  }
  if (beforeAmountOnly) {
    if (!matchedBeforeAmount) {
      let remaining = after;
      for (const alias of aliases) {
        const target = normalize(alias);
        if (target && hasAlias(remaining, target)) {
          remaining = removeAliasFromText(remaining, target);
          break;
        }
      }
      return before + remaining;
    }
    return before + after;
  }
  let value = before + after;
  for (const alias of aliases) {
    const target = normalize(alias);
    if (target && hasAlias(value, target)) value = removeAliasFromText(value, target);
  }
  return value;
}
function extractIncomeSourceName(text) {
  const raw = String(text || "");
  const marker = /(?:\bavec\s+(?:(?:mon|ma|le|la|un|une)\s+)?(?:revenu|source|salaire)\s+(?:de\s+)?|\bsur\s+(?:(?:mon|ma|le|la)\s+)?(?:revenu|source|salaire)\s+(?:de\s+)?|\bdepuis\s+(?:(?:mon|ma|le|la)\s+)?(?:revenu|source|salaire)\s+(?:de\s+)?|\bpreleve(?:e)?\s+(?:sur|de)\s+(?:(?:mon|ma|le|la)\s+)?(?:revenu|source|salaire)\s+(?:de\s+)?)(.+)$/i;
  const match = raw.match(marker);
  if (!match) return "";
  const value = match[1]
    .replace(/\b(?:fcfa|f\s*cfa|xaf|cfa|eru|euros?|francs?|frs?)\b/gi, " ")
    .replace(/\b\d{1,3}(?:[ .,'’]\d{3})+\b|\b\d{1,10}\b/g, " ")
    .replace(/[,:;.!?]+$/g, "")
    .replace(/\s+/g, " ").trim();
  if (!value || /^(tous|toutes|aucun|aucune)$/i.test(value)) return "";
  return value.slice(0, 100);
}
function extractCounterparty(text, type) {
  let value = String(text || "");
  value = value
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/\b[0-3]?\d[/.-][01]?\d(?:[/.-]20\d{2})?\b/g, " ")
    .replace(/\b\d{1,2}(?:er)?\s+(?:janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)(?:\s+20\d{2})?\b/gi, " ")
    .replace(/\b(?:janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\s+\d{1,2}(?:\s+20\d{2})?\b/gi, " ")
    .replace(/\b(avant[- ]hier|demain|apres[- ]demain|hier|aujourd'hui|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|dernier|derniere|dernière|passe|passé|passee|passée|prochain|prochaine)\b/gi, " ")
    .replace(/\b\d{1,3}(?:[ .,'’]\d{3})+\b|\b\d{1,10}\b/g, " ")
    .replace(/\b(fcfa|xaf|cfa|eru|euros?|francs?|frs?)\b/gi, " ")
    .replace(/(?:echeance|échéance|date limite|à rendre|a rendre|avant le|a payer le|à payer le|pour le)\s*(?:le|du)?\s*[:]?(20\d{2}-\d{2}-\d{2}|demain|hier|apres[- ]demain)?/gi, " ");
  value = normalize(value)
    .replace(/\b(j'ai|jai|je|nous|on|ai|contracte|contracter|pris|prends|dois|doit|pret|prets|prete|preter|dette|dettes|emprunt|emprunte|emprunter|rembours\w*|regle|regler|payer|paye|argent|fcfa|echeance|date|limite|rendre|avant|demain|hier|apres|aujourd'hui)\b/gi, " ")
    .replace(/\b(une|un|de|du|des|chez|aupres|a|pour|la|le|les|mon|ma|mes|moi|lui|elle|il|m'a|me|m|te|se|son|sa|ses)\b/gi, " ")
    .replace(/[^a-z0-9' -]/g, " ").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const normalizedName = value.split(" ").filter(Boolean).slice(-4);
  const rawTokens = String(text || "").match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*/g) || [];
  const preserved = [];
  let cursor = rawTokens.length - 1;
  for (let index = normalizedName.length - 1; index >= 0; index--) {
    const target = normalizedName[index];
    while (cursor >= 0) {
      const candidate = rawTokens[cursor--];
      if (normalize(candidate) === target) {
        preserved.unshift(candidate);
        break;
      }
    }
  }
  const name = (preserved.length ? preserved.join(" ") : normalizedName.join(" ")).slice(0, 100);
  return name ? name.charAt(0).toLocaleUpperCase("fr-FR") + name.slice(1) : "";
}
function cleanNote(text, categoryAliases = [], beforeAmountOnly = false) {
  return stripAliasTerms(String(text || ""), categoryAliases, beforeAmountOnly)
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/\b[0-3]?\d[/.\-][01]?\d(?:[/.\-]20\d{2})?\b/g, " ")
    .replace(/\b\d{1,3}(?:[ .,'’]\d{3})+\b|\b\d{1,10}\b/g, " ")
    .replace(/\b(fcfa|f\s*cfa|xaf|cfa|eru|euros?|francs?|frs?)\b/gi, " ")
    .replace(/\b(j'ai|jai|je|nous|on|a|aujourd'hui|demain|hier|dépensé|depense|depenses|paye|payer|achete|achat|acheté|reçu|recu|gagné|gagne|encaisse|encaissement|versé|verse|pour|de|du|des|un|une|la|le|les|mon|ma|mes|revenu|recette|facture|factures|factu|pret|prêt|dette|dettes|emprunt|echeance|échéance|date|limite|rendre|avant|a|le|du|programme|programmer|planifie|planifier|prevois|prévois|prevoir|prévoir|quotidien|quotidienne|hebdomadaire|mensuel|mensuelle|chaque|jours|jour|semaine|mois)\b/gi, " ")
    .replace(/\b\d{1,2}\s+(?:janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\b/gi, " ")
    .replace(/\b(?:janvier|janv|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\s+\d{1,2}\b/gi, " ")
    .replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|dernier|dernière|prochain|prochaine)\b/gi, " ")
    .replace(/(?:^|\W)(?:passé|passée|passés|passées)(?=\W|$)/gi, " ")
    .replace(/[,:;.!?–—-]/g, " ").replace(/\b(au)\s+\1\b/gi, "$1").replace(/\s+/g, " ").trim().slice(0, 180);
}
function extractIncomeSource(raw, categoryId, incomeMatch, customIncomeCategory) {
  let value = String(raw || "");
  value = value.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,3}(?:[ .,'’]\d{3})+\b|\b\d{1,10}\b/g, " ")
    .replace(/\b(?:le|du)\s+[0-3]?\d\b/gi, " ")
    .replace(/\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+(?:dernier|derniere|passe|passee|prochain|prochaine))?\b/gi, " ")
    .replace(/\b(avant[- ]hier|demain|apres[- ]demain|hier|aujourd'hui)\b/gi, " ")
    .replace(/\b(fcfa|xaf|cfa|francs?)\b/gi, " ")
    .replace(/\b(revenu|revenus|revenue|revenues|recette|recettes|recu|reçu|reçus|reçue|j'ai|jai|je|on|a|de|du|des|par|pour|un|une|le|la|les|mon|ma|mes|hier|demain|date|provenant|provenance)\b/gi, " ");
  if (incomeMatch) value = value.replace(incomeMatch[1], " ");
  for (const alias of INCOME_INTENT_ALIASES) value = removeAliasFromText(value, normalize(alias));
  if (customIncomeCategory?.name || customIncomeCategory?.label) {
    value = removeAliasFromText(value, normalize(customIncomeCategory.name || customIncomeCategory.label));
  }
  value = value.replace(/\b(salaire|paie|business|benefice|bénéfice|prestation|freelance|vente|vendu|vendre|commission|prime|bonus|loyer|location|locataire|pension|allocation|cadeau|don|remuneration|traitement|appointement)\b/gi, " ");
  value = value.replace(/[,:;.!?]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  if (value) return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1);
  const labels = { salary: "Salaire", business: "Business", sales: "Vente", commission: "Commission", rental: "Loyer reçu", pension: "Pension", gift: "Don reçu" };
  return customIncomeCategory?.name || customIncomeCategory?.label || labels[categoryId] || "Autre revenu";
}
function extractBillDetails(raw, normalized) {
  const billRules = [
    ["electricity", /electricite|enedis|eneo|sonel|facture.{0,15}courant|courant/i, "housing", "Électricité", ["electricite", "eneo", "sonel", "courant", "lumiere"]],
    ["water", /facture d'eau|eau|camwater|consommation eau/i, "housing", "Eau", ["eau", "camwater", "consommation eau"]],
    ["rent", /loyer|location|bail/i, "housing", "Loyer", ["loyer", "location", "bail"]],
    ["television", /canal\+?|tv|television|tnt|bouquet/i, "internet", "Télévision", ["canal", "television", "bouquet", "tnt"]],
    ["internet", /internet|wifi|fibre|box|connexion/i, "internet", "Internet", ["internet", "wifi", "fibre", "box", "connexion"]],
    ["telephone", /telephone|credit|forfait|mtn|orange/i, "internet", "Téléphone", ["telephone", "credit", "forfait", "recharge"]],
    ["taxes", /impot|taxe|impots|redevance/i, "other", "Impôts", ["impot", "taxe", "redevance"]],
    ["insurance", /assurance|assureur|prime assurance/i, "other", "Assurance", ["assurance", "assureur"]],
    ["school", /ecole|scolarite|universite|frais scolaires|inscription/i, "other", "Scolarité", ["ecole", "scolarite", "universite", "inscription"]],
  ];
  const match = billRules.find(([, pattern, , , aliases]) => pattern.test(normalized) || aliases.some((alias) => hasAlias(normalized, alias)));
  const frequency = /hebdomadaire|chaque semaine|par semaine|toutes les semaines/i.test(normalized) ? "weekly"
    : /trimestriel|chaque trimestre|tous les 3 mois/i.test(normalized) ? "quarterly"
    : /annuel|chaque annee|par an|tous les ans/i.test(normalized) ? "yearly"
    : /mensuel|chaque mois|par mois|tous les mois/i.test(normalized) ? "monthly" : null;
  if (!match) return { billType: "other", expenseCategoryId: "other", billName: "Facture à préciser", frequency };
  return { billType: match[0], expenseCategoryId: match[2], billName: "Facture " + match[3], frequency, categoryAliases: match[4] };
}
export function parseQuickCapture(input, now = new Date(), options = {}) {
  const raw = String(input || "").trim().slice(0, 500);
  const normalized = normalize(raw);
  const amount = extractAmount(raw);
  const isScheduled = /\b(programm\w*|planifi\w*|prevoi\w*|a programmer|a planifier|a prevoir)\b/.test(normalized);
  const requestedFrequency = /\b(quotidien|quotidienne|chaque jour|tous les jours|par jour)\b/.test(normalized) ? "daily"
    : /\b(hebdomadaire|chaque semaine|toutes les semaines|par semaine)\b/.test(normalized) ? "weekly"
    : /\b(mensuel|mensuelle|chaque mois|tous les mois|par mois)\b/.test(normalized) ? "monthly" : null;
  const hasBill = /\bfacture\w*\b|\bquittance\b|\bavis d.?echeance\b|\bnote d.?echeance\b/.test(normalized);
  const repaymentVerb = /\b(rembours\w*|regle|regler|paye|payer)\b/;
  const explicitRepaymentVerb = /\brembours\w*\b/;
  const debtWord = /\b(dette|dettes|emprunt|emprunts|pret|prets)\b/;
  // "J'ai remboursé les 500 de Phinéas" est déjà une action de dette explicite.
  // Exiger le mot "dette" faisait classer cette phrase comme dépense ordinaire.
  const hasRepayment = explicitRepaymentVerb.test(normalized)
    || ((repaymentVerb.test(normalized) && debtWord.test(normalized)
      && normalized.search(repaymentVerb) < normalized.search(debtWord))
    || (debtWord.test(normalized) && repaymentVerb.test(normalized)
      && normalized.search(debtWord) < normalized.search(repaymentVerb)));
  const borrowedIntent = /\b(emprunt\w*|emprunte\w*|contracte\w*|endette\w*)\b/.test(normalized)
    // "On m'a prêté" and "Phinéas m'a prêté" describe money received as a loan.
    || /\b(?:on|il|elle|ils|elles|la banque|ma banque|mon ami|mon amie) m'a prete\b/.test(normalized)
    || /\b[a-z]{2,} m'a prete\b/.test(normalized)
    // "J'ai pris 7 500 chez Phinéas" describes borrowed money.
    || /\b(?:j'ai|jai|je viens de) (?:pris|prends)\b.{0,60}\b(?:chez|aupres de|de la part de|a la banque)\b/.test(normalized)
    || /\b(?:pris|prends)\b.{0,30}\b(?:un pret|une avance|de l argent|une somme)\b/.test(normalized);
  const hasLoan = /\bpret\b|\bprets\b|\bprete\b|\bpretee\b|\bpretes\b|\bavance d'argent\b|\bavance a\b/.test(normalized);
  const hasDebt = /\bdette\b|\bdettes\b|\bemprunt\b|\bemprunte\b|\bemprunter\b|\bargent emprunte\b/.test(normalized);
  const explicitDateLabels = /(?:date de (?:transaction|l'operation|operation|paiement|l'achat|achat|facture)|date (?:de )?(?:transaction|paiement|achat)|effectue le|operation du|transaction du)/.test(normalized);
  const income = INCOME_RULES.find((rule) => matchesRules(normalized, rule));
  const expense = EXPENSE_RULES.find((rule) => matchesRules(normalized, rule));
  const availableCategories = Array.isArray(options?.categories) ? options.categories : [];
  const findUserCategory = (categoryType) => availableCategories.find((category) => {
    if (!category || category.type !== categoryType) return false;
    const name = String(category.name || category.label || "").trim();
    if (!name) return false;
    return [name, ...(Array.isArray(category.keywords) ? category.keywords : [])].some((alias) => hasAlias(normalized, alias));
  }) || null;
  const customIncome = findUserCategory("income");
  const customExpense = findUserCategory("expense");
  const incomeSourceName = extractIncomeSourceName(raw);
  const incomeIntent = INCOME_INTENT_ALIASES.some((alias) => hasAlias(normalized, alias));
  const incomeVerb = /\b(recu|recois|reception|encaisse|encaissement|gagne|touche|versement recu|revenu|revenus|revenue|revenues|recette|recettes|remuneration|on m'a envoye|jai recu|on m'a paye|credit de mon compte|argent recu|entree d'argent)\b/.test(normalized) || incomeIntent;
  const expenseVerb = /\b(depense|depens|paye|payer|achete|achat|sorti|sortie|regle|reglement|consomme|consommation|utilise|utilisation|j'ai mange|jai mange)\b/.test(normalized);
  let type = null;
  if (hasBill) type = "bill";
  else if (hasRepayment) type = "debt_repayment";
  else if (borrowedIntent) type = "debt_borrowed";
  else if (hasLoan) type = "loan_given";
  else if (hasDebt) type = "debt_borrowed";
  else if (expense && (expenseVerb || incomeSourceName)) type = "expense";
  else if (income || incomeVerb || customIncome) type = "income";
  else if (customExpense || expense || expenseVerb || (amount && cleanNote(raw))) type = "expense";

  const bill = hasBill ? extractBillDetails(raw, normalized) : null;
  const categoryId = type === "income"
    ? (customIncome?.id || (income ? income[0] : "other_income"))
    : type === "expense"
      ? (customExpense?.id || (expense ? expense[0] : "other"))
      : type === "bill" ? bill.expenseCategoryId
      : type === "loan_given" ? "loan_given"
      : type === "debt_borrowed" ? "debt_borrowed"
      : type === "debt_repayment" ? "debt_repayment" : null;
  const person = type === "loan_given" || type === "debt_borrowed" || type === "debt_repayment"
    ? extractCounterparty(raw, type) : "";
  const expenseAliases = [
    ...(expense?.[2] || []),
    ...(customExpense ? [customExpense.name || customExpense.label] : []),
  ].filter(Boolean);
  const source = type === "income" ? extractIncomeSource(raw, categoryId, income?.[1], customIncome) : "";
  const incomeAliases = [
    ...INCOME_INTENT_ALIASES,
    ...(income?.[2] || []),
    ...(customIncome ? [customIncome.name || customIncome.label] : []),
    ...(source ? [source] : []),
  ];
  const note = cleanNote(raw,
    type === "expense" ? expenseAliases
      : type === "income" ? incomeAliases
      : type === "bill" ? bill?.categoryAliases || [] : [],
    type === "expense");
  const dueDate = hasRepayment ? null : extractDueDate(raw, now, hasBill, hasLoan, hasDebt);
  const confidence = Math.min(0.99, (amount ? 0.55 : 0) + (type ? 0.25 : 0) + (categoryId ? 0.18 : 0));
  const missingRequiredDetail = (type === "loan_given" || type === "debt_borrowed" || type === "debt_repayment") && !person;
  const needsReview = (type !== "bill" && (!amount || !type || !categoryId || missingRequiredDetail))
    || (!type && !amount);
  return {
    raw, amount, type, categoryId,
    date: (hasBill || hasLoan || hasDebt) && dueDate ? (now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate())) : extractDate(raw, now),
    dueDate,
    note, source, person, incomeSourceName, confidence,
    billName: bill?.billName || "", billType: bill?.billType || "",
    expenseCategoryId: bill?.expenseCategoryId || "",
    frequency: bill?.frequency || requestedFrequency || null,
    isScheduled,
    recurrenceEnabled: isScheduled && (Boolean(requestedFrequency) || (type === "income" && categoryId === "salary")),
    isVariable: type === "bill" && !amount,
    needsReview,
  };
}
