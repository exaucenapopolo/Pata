/**
 * Number of CSS pixels needed to move the active amount field above Pata's
 * fixed custom keypad. Keeping this calculation pure makes viewport behavior
 * predictable and easy to regression-test.
 */
export function getMoneyKeypadScrollOffset(inputRect, keypadRect, gap = 16) {
  const inputBottom = Number(inputRect?.bottom);
  const keypadTop = Number(keypadRect?.top);
  const safeGap = Number.isFinite(Number(gap)) ? Math.max(0, Number(gap)) : 16;
  if (!Number.isFinite(inputBottom) || !Number.isFinite(keypadTop)) return 0;
  return Math.max(0, Math.ceil(inputBottom - keypadTop + safeGap));
}
