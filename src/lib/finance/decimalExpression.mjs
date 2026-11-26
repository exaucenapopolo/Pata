const MAX_EXPRESSION_LENGTH = 120;
const MAX_DIGITS = 24;
const MAX_INTEGER_DIGITS = 78;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_POWER = 20n;

function integerSqrt(value) {
  if (value < 0n) throw new Error('Racine carrée impossible pour un nombre négatif.');
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) >> 1n;
  while (y < x) { x = y; y = (x + value / x) >> 1n; }
  return x;
}

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
  const expression = String(source ?? '').trim().replace(/,/g, '.').replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/²/g, '^2').replace(/√\s*\(/g, 'sqrt(');
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
    } else if (expression.slice(index, index + 4).toLowerCase() === 'sqrt') {
      tokens.push({ type: 'sqrt', value: 'sqrt' });
      index += 4;
    } else if ('+-*/()^%'.includes(char)) {
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
    if (peek()?.type === 'sqrt') {
      consume('sqrt');
      consume('(');
      const value = parseSum();
      consume(')');
      if (value.n < 0n) throw new Error('Racine carrée impossible pour un nombre négatif.');
      const scale = 10n ** 12n;
      const scaledRoot = integerSqrt((value.n * scale * scale) / value.d);
      return fraction(scaledRoot, scale);
    }
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
    let value = consume('number').value;
    while (peek()?.type === '%') {
      consume('%');
      value = fraction(value.n, value.d * 100n);
    }
    return value;
  };

  const parsePower = () => {
    const value = parsePrimary();
    if (peek()?.type !== '^') return value;
    consume('^');
    const exponent = parsePower();
    if (exponent.d !== 1n || exponent.n > MAX_POWER || exponent.n < -MAX_POWER) throw new Error('La puissance doit être un entier entre -20 et 20.');
    const power = Number(exponent.n);
    if (power === 0) return fraction(1n);
    const magnitude = BigInt(Math.abs(power));
    const numerator = value.n ** magnitude;
    const denominator = value.d ** magnitude;
    return power > 0 ? fraction(numerator, denominator) : fraction(denominator, numerator);
  };

  const parseProduct = () => {
    let value = parsePower();
    while (peek()?.type === '*' || peek()?.type === '/') {
      const operator = tokens[cursor++].type;
      const right = parsePower();
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
 * Supports arithmetic, percentages, integer powers, square roots, parentheses and decimal commas.
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


/** Applies a keypad action without confusing action names with entered characters. */
export function applyMoneyKey(expression, key) {
  const current = String(expression ?? '');
  const action = String(key ?? '');
  if (action === 'clear' || action === 'C') return '';
  if (action === 'delete' || action === '⌫') return current.slice(0, -1);
  if (action === 'sqrt') return current + 'sqrt(';
  if (action === 'square') return current + '^2';
  return current + action;
}
