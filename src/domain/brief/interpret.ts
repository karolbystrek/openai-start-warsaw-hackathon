import {
  ShoppingBriefInterpretationSchema,
  ShoppingRequestSchema,
  type BriefAmbiguity,
  type ShoppingBriefInterpretation,
  type ShoppingRequest,
} from "@/domain/contracts";
import type { BriefInterpreter, ConfirmedBriefProjector } from "@/domain/services";
import { presentationProducts, type PresentationProductProfile } from "@/domain/catalog/presentation-products";

export const BRIEF_PROMPT_VERSION = "shopping-brief-v1";
export const BRIEF_OUTPUT_SCHEMA_VERSION = "shopping-brief-interpretation-v1";

const moneyFromText = (sourceText: string) => {
  const prefix = sourceText.match(/(?:under|below|maximum|max|up to|no more than)\s+(EUR|GBP|USD|€)\s*(\d+(?:[.,]\d{1,2})?)/i);
  const suffix = sourceText.match(/(?:under|below|maximum|max|up to|no more than)\s+(\d+(?:[.,]\d{1,2})?)\s*(EUR|GBP|USD|€)/i);
  const amount = prefix?.[2] ?? suffix?.[1];
  if (!amount) return null;
  const currencyToken = prefix?.[1] ?? suffix?.[2];
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

const resolvePresentationProduct = (sourceText: string): PresentationProductProfile | null => {
  const normalized = sourceText.toLowerCase();
  if (/\bnike\b/.test(normalized) && /\bdunk\s*low\b/.test(normalized)) {
    return presentationProducts.find((profile) => profile.id === "shoes") ?? null;
  }
  if (/\baalto\b/.test(normalized) && /\b(?:iittala|vase|wazon)\b/.test(normalized)) {
    return presentationProducts.find((profile) => profile.id === "vase") ?? null;
  }
  if (/\bmac\s*book\b|\bmacbook\b/.test(normalized)) {
    return presentationProducts.find((profile) => profile.id === "macbook") ?? null;
  }
  return null;
};

const resolveRequiredVariant = (
  sourceText: string,
  profile: PresentationProductProfile | null,
): string | null => {
  if (!profile) return null;
  if (profile.id === "shoes") {
    const size = sourceText.match(/\b(?:size|eu|rozmiar)\s*(\d{2}(?:[.,]5)?)\b/i)?.[1];
    return size ? `EU ${size.replace(",", ".")}` : null;
  }
  if (profile.id === "vase") {
    const millimetres = sourceText.match(/\b(\d{2,3})\s*mm\b/i)?.[1];
    const centimetres = sourceText.match(/\b(\d{1,2})\s*cm\b/i)?.[1];
    const height = millimetres ?? (centimetres ? String(Number(centimetres) * 10) : null);
    const clear = /\b(?:clear|transparent|przezroczyst\w*)\b/i.test(sourceText);
    const glass = /\b(?:glass|szklan\w*)\b/i.test(sourceText);
    return height && clear && glass ? `${height} mm clear glass` : null;
  }

  const screen = /\b13(?:[.,]6)?\s*(?:-?\s*inch|inches|in\b|″)/i.test(sourceText);
  const chip = /\bm3\b/i.test(sourceText);
  const memory = /\b16\s*gb(?:\s*(?:ram|memory|pamięci))?\b/i.test(sourceText);
  const storage = /\b512\s*gb(?:\s*(?:ssd|storage|dysk\w*))?\b/i.test(sourceText);
  return screen && chip && memory && storage ? "13-inch 16 GB RAM 512 GB SSD" : null;
};

const variantQuestion = (profile: PresentationProductProfile | null): string => {
  if (profile?.id === "vase") return "Do you need the 160 mm clear-glass Aalto vase?";
  if (profile?.id === "macbook") return "Do you need the 13-inch M3 model with 16 GB RAM and 512 GB SSD?";
  return "Which EU shoe size do you need?";
};

export class DeterministicBriefInterpreter implements BriefInterpreter {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async interpret(sourceText: string): Promise<ShoppingBriefInterpretation> {
    const text = sourceText.trim();
    const profile = resolvePresentationProduct(text);
    const requiredVariant = resolveRequiredVariant(text, profile);
    const maximumLandedCost = moneyFromText(text);
    const deliveredExplicit = /\b(delivered|landed|including\s+(?:shipping|delivery))\b/i.test(text);
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
    if (!profile) ambiguities.push(ambiguity("MISSING_PRODUCT", "requestDraft.product", "The product could not be resolved to one of the three supported presentation products.", "Do you want Nike Dunk Low, Iittala Aalto Vase, or Apple MacBook Air M3?"));
    if (!requiredVariant) ambiguities.push(ambiguity("MISSING_SIZE", "requestDraft.requirements.size", "The presentation-critical product variant is incomplete.", variantQuestion(profile)));
    if (!destinationCountry) ambiguities.push(ambiguity("MISSING_DESTINATION", "requestDraft.requirements.destinationCountry", "Delivered cost depends on the delivery destination.", "Which country should the offer be delivered to?"));
    if (!maximumLandedCost) ambiguities.push(ambiguity("MISSING_BUDGET", "requestDraft.requirements.maximumLandedCost", "No unambiguous monetary ceiling and currency were found.", "What is the maximum delivered price and currency?"));
    if (maximumLandedCost && !deliveredExplicit) ambiguities.push(ambiguity("UNCLEAR_DELIVERED_CAP", "requestDraft.requirements.capIncludesDelivery", "It is unclear whether the cap includes delivery and import costs.", "Does your maximum price include delivery, duties, and fees?"));
    if (!condition) ambiguities.push(ambiguity("MISSING_CONDITION", "requestDraft.requirements.condition", "The acceptable product condition was not stated.", "Should the item be new, used, or refurbished?"));
    if (mandateSuggested && !mandateRequested) {
      ambiguities.push(ambiguity("AMBIGUOUS_PURCHASE_CONSENT", "mandateIntent", "The text suggests automation without explicit purchase consent.", "Do you explicitly authorize an automatic simulated purchase under these conditions?"));
    }

    return ShoppingBriefInterpretationSchema.parse({
      schemaVersion: 1,
      originalText: text,
      requestDraft: {
        product: {
          brand: profile?.brand ?? null,
          model: profile?.model ?? null,
          category: profile?.category ?? null,
          identifiers: profile ? [profile.identifier] : [],
        },
        requirements: {
          size: requiredVariant,
          condition,
          quantity: 1,
          destinationCountry,
          allowResellers,
          maximumLandedCost,
          capIncludesDelivery: maximumLandedCost ? deliveredExplicit : null,
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
