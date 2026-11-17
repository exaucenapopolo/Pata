const MAX_EXPRESSION_LENGTH = 120;
const MAX_DIGITS = 24;
const MAX_INTEGER_DIGITS = 78;
const ROUNDING_SCALE = 1_000_000n;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

function gcd(a, b) {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1n;
}

function fraction(numerator, denominator = 1n) {
  if (denominator === 0n) throw new Error('Division par zéro impossible.');
  const sign = denominator < 0n ? -1n : 1n;
  let n = numerator * sign;
  let d = denominator * sign;
  const divisor = gcd(n, d);
  n /= divisor;
  d /= divisor;
  if (n.toString().length > MAX_INTEGER_DIGITS || d.toString().length > MAX_INTEGER_DIGITS) {
    throw new Error('Ce calcul est trop grand pour être traité en toute sécurité.');
  }
  return { n, d };
}

function tokenize(source) {
  const expression = String(source ?? '').trim().replace(/,/g, '.').replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (!expression) return [];
  if (expression.length > MAX_EXPRESSION_LENGTH) throw new Error('Calcul trop long.');
  const tokens = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const start = index;
      let dots = 0;
      while (index < expression.length && /[0-9.]/.test(expression[index])) {
        if (expression[index] === '.') dots += 1;
        index += 1;
      }
      const raw = expression.slice(start, index);
      if (dots > 1 || raw === '.' || raw.length > MAX_DIGITS + 1) throw new Error('Nombre invalide.');
      const [whole = '0', decimalPart = ''] = raw.split('.');
      const digits = (whole || '0') + decimalPart;
      if (digits.length > MAX_DIGITS) throw new Error('Nombre trop grand.');
      const scale = 10n ** BigInt(decimalPart.length);
      const value = BigInt(digits || '0');
      tokens.push({ type: 'number', value: fraction(value, scale) });
    } else if ('+-*/()'.includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
    } else {
      throw new Error('Caractère non autorisé dans le calcul.');
    }
    if (tokens.length > 80) throw new Error('Calcul trop complexe.');
  }
  return tokens;
}

function evaluateTokens(tokens) {
  let cursor = 0;
  const peek = () => tokens[cursor];
  const consume = (type) => {
    if (peek()?.type !== type) throw new Error('Calcul incomplet.');
    return tokens[cursor++];
  };

  const parsePrimary = () => {
    if (peek()?.type === '+') {
      consume('+');
      return parsePrimary();
    }
    if (peek()?.type === '-') {
      consume('-');
      const value = parsePrimary();
      return { n: -value.n, d: value.d };
    }
    if (peek()?.type === '(') {
      consume('(');
      const value = parseSum();
      consume(')');
      return value;
    }
    return consume('number').value;
  };

  const parseProduct = () => {
    let value = parsePrimary();
    while (peek()?.type === '*' || peek()?.type === '/') {
      const operator = tokens[cursor++].type;
      const right = parsePrimary();
      value = operator === '*'
        ? fraction(value.n * right.n, value.d * right.d)
        : fraction(value.n * right.d, value.d * right.n);
    }
    return value;
  };

  const parseSum = () => {
    let value = parseProduct();
    while (peek()?.type === '+' || peek()?.type === '-') {
      const operator = tokens[cursor++].type;
      const right = parseProduct();
      value = operator === '+'
        ? fraction(value.n * right.d + right.n * value.d, value.d * right.d)
        : fraction(value.n * right.d - right.n * value.d, value.d * right.d);
    }
    return value;
  };

  const result = parseSum();
  if (cursor !== tokens.length) throw new Error('Vérifie les opérateurs et les parenthèses.');
  return result;
}

function formatExact(value, digits = 6) {
  const negative = value.n < 0n;
  const numerator = negative ? -value.n : value.n;
  const scaled = (numerator * (10n ** BigInt(digits)) * 2n + value.d) / (2n * value.d);
  const scale = 10n ** BigInt(digits);
  const whole = scaled / scale;
  const decimal = (scaled % scale).toString().padStart(digits, '0').replace(/0+$/, '');
  const sign = negative && scaled !== 0n ? '-' : '';
  return sign + whole.toString() + (decimal ? '.' + decimal : '');
}

function roundToWhole(value) {
  const negative = value.n < 0n;
  const numerator = negative ? -value.n : value.n;
  let whole = numerator / value.d;
  const remainder = numerator % value.d;
  if (remainder * 2n >= value.d) whole += 1n;
  if (whole > MAX_SAFE_INTEGER) throw new Error('Le résultat dépasse la capacité maximale du montant.');
  return (negative ? -whole : whole).toString();
}

/**
 * Evaluates a basic arithmetic expression with exact rational arithmetic.
 * Supported operators: +, -, *, /, ×, ÷, parentheses and decimal commas.
 * No eval or floating-point arithmetic is used for the calculation itself.
 */
export function evaluateMoneyExpression(source) {
  const tokens = tokenize(source);
  if (!tokens.length) return { exactValue: '', roundedValue: '', isRounded: false };
  const result = evaluateTokens(tokens);
  const exactValue = formatExact(result);
  const roundedValue = roundToWhole(result);
  return {
    exactValue,
    roundedValue,
    isRounded: !/^-?\d+$/.test(exactValue),
  };
}
