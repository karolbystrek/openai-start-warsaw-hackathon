export function formatMoney(currency: string, minorUnits: number): string {
  if (!Number.isSafeInteger(minorUnits)) throw new Error("Money must use safe integer minor units.");
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    useGrouping: true,
  });
  const resolved = formatter.resolvedOptions();
  const fractionDigits = resolved.maximumFractionDigits ?? resolved.minimumFractionDigits ?? 2;
  return formatter
    .format(minorUnits / (10 ** fractionDigits))
    .replace(/[\u00a0\u202f]/g, " ");
}
