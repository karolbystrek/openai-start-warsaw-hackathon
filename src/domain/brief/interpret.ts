import {
  ShoppingBriefInterpretationSchema,
  ShoppingRequestSchema,
  type BriefAmbiguity,
  type ShoppingBriefInterpretation,
  type ShoppingRequest,
} from "@/domain/contracts";
import type { BriefInterpreter, ConfirmedBriefProjector } from "@/domain/services";

export const BRIEF_PROMPT_VERSION = "shopping-brief-v1";
export const BRIEF_OUTPUT_SCHEMA_VERSION = "shopping-brief-interpretation-v1";

const moneyFromText = (sourceText: string) => {
  const qualifier = "(?:under|below|maximum|max|up to|no more than|(?:update|change|set)(?:\\s+the)?(?:\\s+maximum)?(?:\\s+delivered)?(?:\\s+price|\\s+budget)?\\s+to)";
  const matches = [
    ...sourceText.matchAll(new RegExp(`${qualifier}\\s+(EUR|GBP|USD|€)\\s*(\\d+(?:[.,]\\d{1,2})?)`, "gi")),
    ...sourceText.matchAll(new RegExp(`${qualifier}\\s+(\\d+(?:[.,]\\d{1,2})?)\\s*(EUR|GBP|USD|€)`, "gi")),
  ].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  const match = matches.at(-1);
  if (!match) return null;
  const currencyFirst = /^(?:EUR|GBP|USD|€)$/i.test(match[1] ?? "");
  const currencyToken = currencyFirst ? match[1] : match[2];
  const amount = currencyFirst ? match[2] : match[1];
  if (!amount) return null;
  const currency = currencyToken === "€" ? "EUR" : currencyToken?.toUpperCase();
  if (!currency) return null;
  const [whole = "0", fraction = ""] = amount.replace(",", ".").split(".");
  return { currency, minorUnits: Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2)) };
};

const ambiguity = (
  code: BriefAmbiguity["code"],
  fieldPath: string,
  explanation: string,
  clarificationQuestion: string,
): BriefAmbiguity => ({ code, fieldPath, blocking: true, explanation, clarificationQuestion });

export class DeterministicBriefInterpreter implements BriefInterpreter {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async interpret(sourceText: string): Promise<ShoppingBriefInterpretation> {
    const text = sourceText.trim();
    const lower = text.toLowerCase();
    const isNikeDunkLow = /\bnike\b/.test(lower) && /\bdunk\s*low\b/.test(lower);
    const sizeMatch = [...text.matchAll(/\b(?:size|eu)\s*(\d{2}(?:[.,]5)?)\b/gi)].at(-1);
    const maximumLandedCost = moneyFromText(text);
    const destinationCountry = /\b(poland|polska|\bpl\b)\b/i.test(text) ? "PL" : null;
    const condition = /\bnew\s+only\b/i.test(text)
      ? "NEW" as const
      : /\brefurbished\b/i.test(text)
        ? "REFURBISHED" as const
        : /\bused\s+only\b/i.test(text)
          ? "USED" as const
          : null;
    const allowResellers = /\bno\s+(?:resellers?|marketplaces?)\b/i.test(text) ? false : true;
    const mandateRequested = /\b(?:just\s+buy|auto(?:matically)?\s*buy|do\s+not\s+ask)\b/i.test(text);
    const mandateSuggested = /\b(?:buy|purchase)\b/i.test(text);
    const requireLowStock = mandateRequested ? /\b(?:low\s+stock|stock\s+is\s+low)\b/i.test(text) : null;
    const withinMatch = text.match(/within\s+(?:(?:EUR|GBP|USD|€)\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*(?:EUR|GBP|USD))?\s+of\s+the\s+target/i);
    const withinMinor = withinMatch?.[1]
      ? Math.round(Number(withinMatch[1].replace(",", ".")) * 100)
      : null;
    const mandateMinimum = mandateRequested && maximumLandedCost && withinMinor !== null
      ? { ...maximumLandedCost, minorUnits: Math.max(0, maximumLandedCost.minorUnits - withinMinor) }
      : null;

    const ambiguities: BriefAmbiguity[] = [];
    if (!isNikeDunkLow) ambiguities.push(ambiguity("MISSING_PRODUCT", "requestDraft.product", "The product could not be resolved to a supported canonical product.", "Which exact brand and model should be monitored?"));
    if (!sizeMatch?.[1]) ambiguities.push(ambiguity("MISSING_SIZE", "requestDraft.requirements.size", "A required shoe size was not provided.", "Which EU shoe size do you need?"));
    if (!destinationCountry) ambiguities.push(ambiguity("MISSING_DESTINATION", "requestDraft.requirements.destinationCountry", "Delivered cost depends on the delivery destination.", "Which country should the offer be delivered to?"));
    if (!maximumLandedCost) ambiguities.push(ambiguity("MISSING_BUDGET", "requestDraft.requirements.maximumLandedCost", "No unambiguous monetary ceiling and currency were found.", "What is the maximum delivered price and currency?"));
    if (!condition) ambiguities.push(ambiguity("MISSING_CONDITION", "requestDraft.requirements.condition", "The acceptable product condition was not stated.", "Should the item be new, used, or refurbished?"));
    if (mandateSuggested && !mandateRequested) {
      ambiguities.push(ambiguity("AMBIGUOUS_PURCHASE_CONSENT", "mandateIntent", "The text suggests automation without explicit purchase consent.", "Do you explicitly authorize an automatic simulated purchase under these conditions?"));
    }

    return ShoppingBriefInterpretationSchema.parse({
      schemaVersion: 1,
      originalText: text,
      requestDraft: {
        product: {
          brand: isNikeDunkLow ? "Nike" : null,
          model: isNikeDunkLow ? "Dunk Low" : null,
          category: isNikeDunkLow ? "shoes" : null,
          identifiers: [],
        },
        requirements: {
          size: sizeMatch?.[1] ? `EU ${sizeMatch[1].replace(",", ".")}` : null,
          condition,
          quantity: 1,
          destinationCountry,
          allowResellers,
          maximumLandedCost,
          capIncludesDelivery: maximumLandedCost ? true : null,
        },
        preferences: [],
        notificationPolicy: { mode: "ONCE", improvementThresholdMinor: 0 },
      },
      mandateIntent: {
        requested: mandateRequested,
        requireLowStock,
        minimumLandedCost: mandateMinimum,
        maximumLandedCost: mandateRequested ? maximumLandedCost : null,
        requiresConfirmation: true,
      },
      ambiguities,
      provenance: {
        kind: "COMPUTED",
        source: "deterministic-brief-interpreter",
        observedAt: this.now(),
        adapterVersion: "deterministic-brief-v1",
        promptVersion: BRIEF_PROMPT_VERSION,
        outputSchemaVersion: BRIEF_OUTPUT_SCHEMA_VERSION,
      },
    });
  }
}

const stableRequestId = (text: string) => {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `request-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export class ConfirmedShoppingRequestProjector implements ConfirmedBriefProjector {
  project(interpretation: ShoppingBriefInterpretation): ShoppingRequest | null {
    if (interpretation.ambiguities.some((item) => item.blocking)) return null;
    const { product, requirements, preferences, notificationPolicy } = interpretation.requestDraft;
    if (!product.brand || !product.model || !product.category || !requirements.size || !requirements.condition || !requirements.destinationCountry || requirements.allowResellers === null || !requirements.maximumLandedCost || requirements.capIncludesDelivery !== true) return null;
    return ShoppingRequestSchema.parse({
      schemaVersion: 1,
      id: stableRequestId(interpretation.originalText),
      version: 1,
      originalText: interpretation.originalText,
      lifecycle: "DRAFT",
      product: { brand: product.brand, model: product.model, category: product.category, identifiers: product.identifiers },
      requirements: {
        size: requirements.size,
        condition: requirements.condition,
        quantity: requirements.quantity,
        destinationCountry: requirements.destinationCountry,
        allowResellers: requirements.allowResellers,
        maximumLandedCost: requirements.maximumLandedCost,
      },
      preferences,
      notificationPolicy,
      unresolvedAmbiguities: [],
      effectiveAt: interpretation.provenance.observedAt,
    });
  }
}
