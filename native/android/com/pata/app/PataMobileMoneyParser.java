package com.pata.app;

import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.Calendar;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Parse les confirmations MTN MoMo et Orange Money sans conserver le SMS brut. */
public final class PataMobileMoneyParser {
    private static final String CURRENCY = "(?:FCFA|F\\s*\\.?\\s*CFA|XAF|CFA)";
    private static final Pattern FAILURE = Pattern.compile(
        "(\\bechec\\b|\\bfailed\\b|\\brefuse\\b|\\bannule\\b|not completed|transaction rejetee|operation non aboutie)",
        Pattern.CASE_INSENSITIVE
    );

    private PataMobileMoneyParser() {}

    public static JSONObject parse(String sender, String rawBody, long receivedAt) {
        if (rawBody == null || rawBody.trim().isEmpty()) return null;
        String body = rawBody.replaceAll("\\s+", " ").trim();
        String normalized = normalize(body);
        String source = normalize(String.valueOf(sender) + " " + body);
        if (FAILURE.matcher(normalized).find()) return null;

        String provider = detectProvider(source, normalize(sender));
        String event = detectEvent(normalized);
        Integer amount = detectAmount(normalized);
        if (provider == null || event == null || amount == null) return null;

        long timestamp = receivedAt > 0 ? receivedAt : System.currentTimeMillis();
        String transactionId = detectTransactionId(body);
        String identity = transactionId == null
            ? provider + ":" + timestamp + ":" + normalized
            : provider + ":" + transactionId.toUpperCase(Locale.ROOT);
        String hash = sha256(identity);
        if (hash.isEmpty()) return null;

        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(timestamp);
        applyDateAndTime(calendar, body);

        JSONObject result = new JSONObject();
        try {
            result.put("provider", provider);
            result.put("transactionHash", hash);
            result.put("transactionIdPresent", transactionId != null);
            result.put("eventType", event);
            result.put("direction", "receive".equals(event) ? "income" : "withdrawal".equals(event) ? "withdrawal" : "expense");
            result.put("amount", amount);
            result.put("date", String.format(Locale.ROOT, "%04d-%02d-%02d",
                calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH) + 1, calendar.get(Calendar.DAY_OF_MONTH)));
            result.put("time", String.format(Locale.ROOT, "%02d:%02d",
                calendar.get(Calendar.HOUR_OF_DAY), calendar.get(Calendar.MINUTE)));
            String counterparty = detectCounterparty(normalized);
            if (counterparty != null) result.put("counterparty", counterparty);
            Integer balance = detectBalance(normalized);
            if (balance != null) result.put("balance", balance);
            return result;
        } catch (Exception error) {
            return null;
        }
    }

    private static String detectProvider(String source, String sender) {
        if (source.matches("(?s).*(orange\\s*(money|cash)|orange\\s*cm|omcm|orange-money|\\bom\\b).*")
            || sender.equals("om") || sender.contains("orange")) return "orange_money";
        if (source.matches("(?s).*(\\bmtn\\b|momo|mobile\\s*money|yello\\s*money|yel'lo).*")) return "mtn_momo";
        return null;
    }

    private static String detectEvent(String text) {
        if (Pattern.compile("\\b(retrait|retirer|withdrawal|withdraw|cash\\s*out|cashout)\\b").matcher(text).find()) return "withdrawal";
        if (Pattern.compile("(paiement|payment|marchand|merchant|achat\\s+(reussi|effectue)|bill\\s+paid|facture\\s+payee)").matcher(text).find()) return "payment";
        if (Pattern.compile("(vous\\s+(avez\\s+recu|venez\\s+de\\s+recevoir)|transfert\\s+recu|recu\\s+de|reception\\s+de|compte.{0,25}credite|credit.{0,20}compte|depot\\s+(recu|effectue|confirme)|cash\\s*in|cashin|received|credited|incoming\\s+transfer)").matcher(text).find()) return "receive";
        if (Pattern.compile("(vous\\s+avez\\s+envoye|transfert\\s+(effectue|envoye|confirme)|effectue\\s+(un\\s+)?transfert|envoye\\s+(a|au|vers)|compte.{0,25}debite|debite.{0,20}compte|debit|debited|sent\\s+to|you\\s+sent|outgoing\\s+transfer)").matcher(text).find()) return "send";
        return null;
    }

    private static Integer detectAmount(String text) {
        String withoutBalance = text.replaceAll(
            "(nouveau\\s+)?solde(\\s+disponible)?\\s*[:\\-]?\\s*[0-9][0-9\\s.,']{0,22}\\s*(?:" + CURRENCY + ")?", " "
        );
        String number = "([0-9][0-9\\s.,']{0,22})";
        Pattern[] patterns = new Pattern[] {
            Pattern.compile("(?:montant(?:\\s+(?:de\\s+la\\s+)?transaction)?|somme|amount)\\s*[:#\\-]?\\s*(?:de\\s*)?(?:" + CURRENCY + "\\s*)?" + number + "\\s*(?:" + CURRENCY + ")?", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(?:recu|envoye|envoyer|paye|payee|debite|credite|credited|received|sent|effectue)\\s+(?:la\\s+somme\\s+de\\s+|un montant de\\s+|de\\s+)?(?:" + CURRENCY + "\\s*)?" + number + "\\s*(?:" + CURRENCY + ")?", Pattern.CASE_INSENSITIVE),
            Pattern.compile(CURRENCY + "\\s*[:\\-]?\\s*" + number, Pattern.CASE_INSENSITIVE),
            Pattern.compile(number + "\\s*" + CURRENCY + "\\b", Pattern.CASE_INSENSITIVE)
        };
        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(withoutBalance);
            if (matcher.find()) {
                Integer parsed = parseMoney(matcher.group(1));
                if (parsed != null) return parsed;
            }
        }
        return null;
    }

    private static Integer detectBalance(String text) {
        Matcher matcher = Pattern.compile(
            "(?:nouveau\\s+)?solde(?:\\s+disponible)?\\s*[:\\-]?\\s*([0-9][0-9\\s.,']{0,22})\\s*(?:" + CURRENCY + ")",
            Pattern.CASE_INSENSITIVE
        ).matcher(text);
        return matcher.find() ? parseMoney(matcher.group(1)) : null;
    }

    private static Integer parseMoney(String value) {
        if (value == null) return null;
        String compact = value.replaceAll("[\\s\\u00a0']", "").replaceAll("[.,]00$", "");
        String digits = compact.replaceAll("[^0-9]", "");
        try {
            long amount = Long.parseLong(digits);
            return amount > 0 && amount <= 1000000000L ? (int) amount : null;
        } catch (Exception error) {
            return null;
        }
    }

    private static String detectTransactionId(String text) {
        Pattern[] patterns = new Pattern[] {
            Pattern.compile("(?:transaction\\s*(?:id|n[°o]|no\\.?|numero|number)|id\\s*(?:de\\s*)?(?:transaction|operation)?|reference|ref\\.?|code\\s*(?:de\\s*)?(?:transaction|operation)|n[°o]\\s*(?:transaction|operation)?)\\s*[:#\\-]?\\s*([A-Z0-9][A-Z0-9._/-]{3,58})", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\b((?:MP|BP|TX|OM|MTN)[A-Z0-9]{5,}(?:[.-][A-Z0-9]+){0,5})\\b", Pattern.CASE_INSENSITIVE)
        };
        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(text);
            if (matcher.find()) {
                String value = matcher.group(1).replaceAll("[.,;:)]+$", "").trim();
                if (value.length() >= 5) return value;
            }
        }
        return null;
    }

    private static String detectCounterparty(String text) {
        Pattern[] patterns = new Pattern[] {
            Pattern.compile("(?:recu|received)\\s+(?:de|from)\\s+([\\p{L}][\\p{L}' .-]{1,50})(?=[,.;]|$)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(?:envoye?\\s+(?:a|au|vers)|transfert\\s+vers|paye?\\s+(?:a|au)|sent\\s+to)\\s+([\\p{L}][\\p{L}' .-]{1,50})(?=[,.;]|$)", Pattern.CASE_INSENSITIVE)
        };
        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(text);
            if (!matcher.find()) continue;
            String value = matcher.group(1).trim().replaceAll("\\s+", " ");
            if (value.length() < 2 || value.length() > 60 || value.matches("[0-9X+* .-]+")) continue;
            if (value.matches("(?i)(la somme|le montant|votre compte|votre solde|la transaction|un client|un marchand)")) continue;
            return value;
        }
        return null;
    }

    private static void applyDateAndTime(Calendar calendar, String text) {
        Matcher iso = Pattern.compile("\\b(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})\\b").matcher(text);
        Matcher local = Pattern.compile("\\b(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4})\\b").matcher(text);
        try {
            if (iso.find()) {
                calendar.set(Calendar.YEAR, Integer.parseInt(iso.group(1)));
                calendar.set(Calendar.MONTH, Integer.parseInt(iso.group(2)) - 1);
                calendar.set(Calendar.DAY_OF_MONTH, Integer.parseInt(iso.group(3)));
            } else if (local.find()) {
                int year = Integer.parseInt(local.group(3));
                if (year < 100) year += year >= 70 ? 1900 : 2000;
                calendar.set(Calendar.YEAR, year);
                calendar.set(Calendar.MONTH, Integer.parseInt(local.group(2)) - 1);
                calendar.set(Calendar.DAY_OF_MONTH, Integer.parseInt(local.group(1)));
            }
        } catch (Exception ignored) { }
        Matcher time = Pattern.compile("\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b").matcher(text);
        if (time.find()) {
            calendar.set(Calendar.HOUR_OF_DAY, Integer.parseInt(time.group(1)));
            calendar.set(Calendar.MINUTE, Integer.parseInt(time.group(2)));
        }
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .toLowerCase(Locale.ROOT)
            .replace('’', '\'')
            .replaceAll("\\s+", " ")
            .trim();
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte item : digest) result.append(String.format(Locale.ROOT, "%02x", item & 0xff));
            return result.toString();
        } catch (Exception error) {
            return "";
        }
    }
}
