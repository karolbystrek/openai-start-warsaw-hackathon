export const normalizeText = (value: string) => value
  .normalize("NFKD")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

export const normalizeIdentifier = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const normalizeSize = (value: string) => {
  const normalized = normalizeText(value).replace(/^size\s+/, "");
  const match = normalized.match(/^(?:eu\s*)?(\d{2}(?:[.,]\d)?)$/);
  return match?.[1] ? `EU ${match[1].replace(",", ".")}` : value.trim().toUpperCase();
};
