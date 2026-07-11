import Decimal from "decimal.js";

import {
  DeliveryOptionSchema,
  LandedCostSchema,
  PricingSelectionSchema,
  type CouponCandidate,
  type DeliveryOption,
  type EvidenceBundle,
  type LandedCost,
  type LandedCostLine,
  type Money,
  type OfferSnapshot,
  type PricingPath,
  type PricingSelection,
  type Provenance,
  type ShoppingRequest,
} from "@/domain/contracts";
import type { LandedCostCalculator } from "@/domain/services";

export type RoundingMode = "HALF_UP" | "DOWN" | "UP";

export interface FxQuote {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  observedAt: string;
}

export interface CouponRule {
  code: string;
  appliesTo: "ITEM" | "DELIVERY";
  amount: Money;
  merchantIds?: readonly string[];
  minimumItemSubtotal?: Money;
  stackable?: boolean;
  sellerIds?: readonly string[];
  thresholdBasis?: "ITEM_BEFORE_DISCOUNTS" | "ITEM_AFTER_DISCOUNTS" | "CART_BEFORE_DISCOUNTS" | "CART_AFTER_DISCOUNTS";
  eligibility?: "PASS" | "FAIL" | "UNKNOWN";
  eligibilityReason?: string;
  observedAt?: string;
  expiresAt?: string;
}

export interface AdditionalChargeRule {
  code: "TAX" | "DUTY" | "HANDLING";
  label: string;
  destinationCountry: string;
  sourceCurrency?: string;
  fixedAmount: Money;
}

export interface LandedCostRuleSet {
  version: string;
  rounding: RoundingMode;
  fxRoundingIncrementMinor?: number;
  maximumFxAgeMs?: number;
  fxQuotes: readonly FxQuote[];
  coupons?: readonly CouponRule[];
  additionalCharges?: readonly AdditionalChargeRule[];
}

export interface PricingOfferInput {
  offer: OfferSnapshot;
  evidence: EvidenceBundle;
  sellerTrustRank?: number;
  preferredDeliveryMethods?: readonly string[];
}

const decimalRounding = (mode: RoundingMode): Decimal.Rounding => {
  if (mode === "DOWN") return Decimal.ROUND_DOWN;
  if (mode === "UP") return Decimal.ROUND_UP;
  return Decimal.ROUND_HALF_UP;
};

const computedProvenance = (source: string, observedAt: string): Provenance => ({
  kind: "COMPUTED",
  source,
  observedAt,
  adapterVersion: "trust-core-v1",
});

const assertCurrency = (money: Money, currency: string, context: string): void => {
  if (money.currency !== currency) {
    throw new Error(`${context} must be denominated in ${currency}, received ${money.currency}.`);
  }
};

export class DeterministicLandedCostCalculator implements LandedCostCalculator {
  constructor(private readonly rules: LandedCostRuleSet) {}

  async calculate(
    request: ShoppingRequest,
    offer: OfferSnapshot,
    evidence: EvidenceBundle,
  ): Promise<LandedCost> {
    const selection = this.select(request, [{ offer, evidence }]);
    if (!selection.selectedPath?.landedCost) {
      const reasons = selection.alternatives.flatMap((path) => path.reasonCodes).join(", ");
      throw new Error(`No valid pricing path for offer ${offer.id}: ${reasons || "unknown pricing inputs"}.`);
    }
    // Preserve the established identifier for callers using the legacy one-off calculator.
    return LandedCostSchema.parse({
      ...selection.selectedPath.landedCost,
      id: `landed-${offer.id}-${this.rules.version}`,
    });
  }

  select(request: ShoppingRequest, inputs: readonly PricingOfferInput[]): PricingSelection {
    const paths = inputs.flatMap(({ offer, evidence, sellerTrustRank = 0, preferredDeliveryMethods }) => {
      const deliveries = this.deliveryOptions(offer);
      const coupons = this.couponCandidates(offer, evidence);
      const couponSets = this.powerSet(coupons);
      return deliveries.flatMap((delivery) => couponSets.map((couponSet) =>
        this.evaluatePath(
          request,
          offer,
          evidence,
          delivery,
          couponSet,
          sellerTrustRank,
          this.preferenceRank(request, delivery, preferredDeliveryMethods),
        ),
      ));
    });
    const valid = paths.filter((path): path is PricingPath & { landedCost: LandedCost } =>
      path.status === "VALID" && path.landedCost !== null,
    );
    valid.sort((left, right) =>
      left.landedCost.total.minorUnits - right.landedCost.total.minorUnits
      || this.timestampRank(left.deliveryLatestAt) - this.timestampRank(right.deliveryLatestAt)
      || Date.parse(right.freshnessObservedAt) - Date.parse(left.freshnessObservedAt)
      || right.sellerTrustRank - left.sellerTrustRank
      || left.preferredMethodRank - right.preferredMethodRank
      || left.id.localeCompare(right.id),
    );
    const selected = valid[0] ?? null;
    return PricingSelectionSchema.parse({
      selectedPathId: selected?.id ?? null,
      selectedPath: selected,
      alternatives: paths.filter((path) => path.id !== selected?.id),
      tieBreaker: "TOTAL_THEN_DELIVERY_THEN_FRESHNESS_THEN_SELLER_TRUST_THEN_PREFERENCE_THEN_PATH_ID",
    });
  }

  private evaluatePath(
    request: ShoppingRequest,
    offer: OfferSnapshot,
    evidence: EvidenceBundle,
    delivery: DeliveryOption,
    coupons: readonly CouponCandidate[],
    sellerTrustRank: number,
    preferredMethodRank: number,
  ): PricingPath {
    const couponCodes = coupons.map((coupon) => coupon.code).sort();
    const id = `pricing-${offer.id}-${delivery.id}-${couponCodes.join("_") || "none"}`;
    const eligibility = this.checkEligibility(request, offer, evidence, delivery, coupons);
    const audit = {
      deliveryLatestAt: delivery.deliveryWindow?.latestAt ?? null,
      freshnessObservedAt: [
        offer.observedAt,
        delivery.observedAt,
        evidence.seller.provenance.observedAt,
        evidence.stock.provenance.observedAt,
        evidence.condition.provenance.observedAt,
        evidence.destination.provenance.observedAt,
        ...coupons.map((coupon) => coupon.observedAt),
      ]
        .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? offer.observedAt,
      sellerTrustRank,
      preferredMethodRank,
      provenance: computedProvenance(`pricing-path:${this.rules.version}`, offer.observedAt),
    };
    if (eligibility.status !== "VALID") {
      return { id, offerId: offer.id, deliveryOptionId: delivery.id, deliveryMethod: delivery.method, couponCodes, ...eligibility, landedCost: null, ...audit };
    }
    try {
      return {
        id,
        offerId: offer.id,
        deliveryOptionId: delivery.id,
        deliveryMethod: delivery.method,
        couponCodes,
        status: "VALID",
        reasonCodes: [],
        landedCost: this.buildLandedCost(request, offer, evidence, delivery, coupons, id),
        ...audit,
      };
    } catch (error) {
      return {
        id,
        offerId: offer.id,
        deliveryOptionId: delivery.id,
        deliveryMethod: delivery.method,
        couponCodes,
        status: "UNKNOWN",
        reasonCodes: [`PRICING_INPUT_UNKNOWN:${error instanceof Error ? error.message : "unknown"}`],
        landedCost: null,
        ...audit,
      };
    }
  }

  private checkEligibility(
    request: ShoppingRequest,
    offer: OfferSnapshot,
    evidence: EvidenceBundle,
    delivery: DeliveryOption,
    coupons: readonly CouponCandidate[],
  ): Pick<PricingPath, "status" | "reasonCodes"> {
    const rejected: string[] = [];
    const unknown: string[] = [];
    if (evidence.offerId !== offer.id) unknown.push(`EVIDENCE_OFFER_MISMATCH:${evidence.offerId}`);
    if (delivery.eligibility === "FAIL") rejected.push(`DELIVERY_INELIGIBLE:${delivery.eligibilityReason ?? delivery.id}`);
    if (delivery.eligibility === "UNKNOWN") unknown.push(`DELIVERY_ELIGIBILITY_UNKNOWN:${delivery.id}`);
    if (delivery.price === null) unknown.push(`DELIVERY_PRICE_UNKNOWN:${delivery.id}`);
    if (delivery.entitlementStatus === "FAIL") rejected.push(`DELIVERY_ENTITLEMENT_MISSING:${delivery.id}`);
    if (delivery.entitlementStatus === "UNKNOWN") unknown.push(`DELIVERY_ENTITLEMENT_UNKNOWN:${delivery.id}`);
    if (Date.parse(delivery.observedAt) > Date.parse(offer.observedAt)) unknown.push(`DELIVERY_QUOTE_FROM_FUTURE:${delivery.id}`);
    if (delivery.expiresAt && Date.parse(delivery.expiresAt) <= Date.parse(offer.observedAt)) rejected.push(`DELIVERY_QUOTE_EXPIRED:${delivery.id}`);
    if (delivery.deliveryWindow?.earliestAt && delivery.deliveryWindow.latestAt
      && Date.parse(delivery.deliveryWindow.earliestAt) > Date.parse(delivery.deliveryWindow.latestAt)) {
      unknown.push(`DELIVERY_WINDOW_INVALID:${delivery.id}`);
    }
    if (request.requirements.latestDeliveryAt) {
      if (!delivery.deliveryWindow?.latestAt) unknown.push(`DELIVERY_DEADLINE_UNKNOWN:${delivery.id}`);
      else if (Date.parse(delivery.deliveryWindow.latestAt) > Date.parse(request.requirements.latestDeliveryAt)) {
        rejected.push(`DELIVERY_DEADLINE_MISSED:${delivery.id}`);
      }
    }
    if (delivery.destinationCountries && !delivery.destinationCountries.includes(request.requirements.destinationCountry)) {
      rejected.push(`DELIVERY_DESTINATION_INELIGIBLE:${delivery.id}`);
    }
    if (delivery.sellerIds && !delivery.sellerIds.includes(offer.sellerId)) rejected.push(`DELIVERY_SELLER_INELIGIBLE:${delivery.id}`);
    if (delivery.productCategories && !delivery.productCategories.includes(request.product.category)) {
      rejected.push(`DELIVERY_CATEGORY_INELIGIBLE:${delivery.id}`);
    }
    if (delivery.requiredCouponCodes.some((code) => !coupons.some((coupon) => coupon.code === code))) {
      rejected.push(`DELIVERY_REQUIRED_COUPON_MISSING:${delivery.id}`);
    }
    if (delivery.minimumSubtotal && delivery.price !== null) {
      const subtotal = this.thresholdSubtotal(delivery.thresholdBasis, offer, delivery, coupons);
      if (delivery.minimumSubtotal.currency !== offer.itemPrice.currency || subtotal < delivery.minimumSubtotal.minorUnits) {
        rejected.push(`DELIVERY_THRESHOLD_NOT_MET:${delivery.id}`);
      }
    }
    for (const coupon of coupons) {
      if (evidence.coupon.result === "FAIL") rejected.push(`COUPON_EVIDENCE_FAILED:${coupon.code}`);
      if (evidence.coupon.result === "UNKNOWN") unknown.push(`COUPON_EVIDENCE_UNKNOWN:${coupon.code}`);
      if (coupon.eligibility === "FAIL") rejected.push(`COUPON_INELIGIBLE:${coupon.code}`);
      if (coupon.eligibility === "UNKNOWN") unknown.push(`COUPON_ELIGIBILITY_UNKNOWN:${coupon.code}`);
      if (Date.parse(coupon.observedAt) > Date.parse(offer.observedAt)) unknown.push(`COUPON_FROM_FUTURE:${coupon.code}`);
      if (coupon.expiresAt && Date.parse(coupon.expiresAt) <= Date.parse(offer.observedAt)) rejected.push(`COUPON_EXPIRED:${coupon.code}`);
      if (coupon.merchantIds && !coupon.merchantIds.includes(offer.merchantId)) rejected.push(`COUPON_MERCHANT_MISMATCH:${coupon.code}`);
      if (coupon.sellerIds && !coupon.sellerIds.includes(offer.sellerId)) rejected.push(`COUPON_SELLER_MISMATCH:${coupon.code}`);
      if (coupon.minimumSubtotal) {
        const subtotal = this.thresholdSubtotal(coupon.thresholdBasis, offer, delivery, coupons);
        if (coupon.minimumSubtotal.currency !== offer.itemPrice.currency || subtotal < coupon.minimumSubtotal.minorUnits) {
          rejected.push(`COUPON_THRESHOLD_NOT_MET:${coupon.code}`);
        }
      }
    }
    if (coupons.length > 1 && coupons.some((coupon) => !coupon.stackable)) rejected.push("COUPON_SET_NOT_STACKABLE");
    for (const coupon of coupons) {
      if (coupon.combinableWith && coupons.some((other) => other.code !== coupon.code && !coupon.combinableWith?.includes(other.code))) {
        rejected.push(`COUPON_COMBINATION_NOT_ALLOWED:${coupon.code}`);
      }
    }
    if (delivery.exclusions.includes(offer.id) || delivery.exclusions.includes(offer.listingId)) rejected.push(`DELIVERY_EXCLUDED:${delivery.id}`);
    if (request.requirements.destinationCountry && !offer.destinationCountries.includes(request.requirements.destinationCountry)) {
      rejected.push(`DESTINATION_UNSUPPORTED:${request.requirements.destinationCountry}`);
    }
    if (rejected.length) return { status: "REJECTED", reasonCodes: rejected };
    if (unknown.length) return { status: "UNKNOWN", reasonCodes: unknown };
    return { status: "VALID", reasonCodes: [] };
  }

  private buildLandedCost(
    request: ShoppingRequest,
    offer: OfferSnapshot,
    evidence: EvidenceBundle,
    deliveryOption: DeliveryOption,
    coupons: readonly CouponCandidate[],
    pathId: string,
  ): LandedCost {
    if (deliveryOption.price === null) throw new Error(`Delivery price is unknown for ${deliveryOption.id}.`);
    const budgetCurrency = request.requirements.maximumLandedCost.currency;
    const sourceCurrencies = new Set([offer.itemPrice.currency, deliveryOption.price.currency]);
    if (sourceCurrencies.size > 1) throw new Error("item and delivery currencies differ");
    const sourceCurrency = offer.itemPrice.currency;
    const quote = this.findQuote(sourceCurrency, budgetCurrency);
    if (quote) this.assertFreshQuote(quote, offer.observedAt);
    const lines: LandedCostLine[] = [];
    const item = this.convert(offer.itemPrice, budgetCurrency, quote);
    const delivery = this.convert(deliveryOption.price, budgetCurrency, quote);
    lines.push({
      code: sourceCurrency === budgetCurrency ? "ITEM" : "FX",
      label: sourceCurrency === budgetCurrency ? "Item" : `Item converted from ${sourceCurrency}`,
      amount: item,
      operation: sourceCurrency === budgetCurrency ? "ADD" : "CONVERT",
      provenance: sourceCurrency === budgetCurrency
        ? computedProvenance(`offer:${offer.id}:item`, offer.observedAt)
        : computedProvenance(`fx:${sourceCurrency}/${budgetCurrency}@${quote?.rate}`, quote?.observedAt ?? offer.observedAt),
    });
    lines.push({
      code: "DELIVERY",
      label: sourceCurrency === budgetCurrency ? deliveryOption.label : `${deliveryOption.label} converted from ${sourceCurrency}`,
      amount: delivery,
      operation: "ADD",
      provenance: deliveryOption.provenance,
    });
    let total = item.minorUnits + delivery.minorUnits;
    let itemRemaining = item.minorUnits;
    let deliveryRemaining = delivery.minorUnits;
    for (const coupon of coupons) {
      assertCurrency(coupon.amount, budgetCurrency, `Coupon ${coupon.code}`);
      const eligibleRemaining = coupon.appliesTo === "ITEM" ? itemRemaining : deliveryRemaining;
      const couponMinor = Math.min(coupon.amount.minorUnits, eligibleRemaining);
      lines.push({
        code: coupon.appliesTo === "ITEM" ? "ITEM_COUPON" : "DELIVERY_COUPON",
        label: `Coupon ${coupon.code}`,
        amount: { currency: budgetCurrency, minorUnits: couponMinor },
        operation: "SUBTRACT",
        provenance: coupon.provenance,
      });
      total -= couponMinor;
      if (coupon.appliesTo === "ITEM") itemRemaining -= couponMinor;
      else deliveryRemaining -= couponMinor;
    }
    for (const charge of this.rules.additionalCharges ?? []) {
      if (charge.destinationCountry !== request.requirements.destinationCountry) continue;
      if (charge.sourceCurrency && charge.sourceCurrency !== sourceCurrency) continue;
      assertCurrency(charge.fixedAmount, budgetCurrency, `Charge ${charge.label}`);
      lines.push({
        code: charge.code,
        label: charge.label,
        amount: charge.fixedAmount,
        operation: "ADD",
        provenance: computedProvenance(`charge-rule:${this.rules.version}`, offer.observedAt),
      });
      total += charge.fixedAmount.minorUnits;
    }
    return LandedCostSchema.parse({
      schemaVersion: 1,
      id: `landed-${pathId}-${this.rules.version}`,
      offerId: offer.id,
      budgetCurrency,
      lines,
      total: { currency: budgetCurrency, minorUnits: total },
      fxRate: quote?.rate ?? null,
      fxObservedAt: quote?.observedAt ?? null,
      ruleVersion: this.rules.version,
      provenance: computedProvenance(`landed-cost:${this.rules.version}`, offer.observedAt),
    });
  }

  private findQuote(baseCurrency: string, quoteCurrency: string): FxQuote | null {
    if (baseCurrency === quoteCurrency) return null;
    const quote = this.rules.fxQuotes.find(
      (candidate) => candidate.baseCurrency === baseCurrency && candidate.quoteCurrency === quoteCurrency,
    );
    if (!quote) throw new Error(`Missing FX quote for ${baseCurrency}/${quoteCurrency}.`);
    const rate = new Decimal(quote.rate);
    if (!rate.isFinite() || !rate.isPositive()) throw new Error(`Invalid FX rate for ${baseCurrency}/${quoteCurrency}.`);
    return quote;
  }

  private assertFreshQuote(quote: FxQuote, evaluatedAt: string): void {
    const observedAt = Date.parse(quote.observedAt);
    const evaluationTime = Date.parse(evaluatedAt);
    const age = evaluationTime - observedAt;
    const maximumAge = this.rules.maximumFxAgeMs ?? 5 * 60 * 1000;
    if (!Number.isFinite(age) || age < 0 || age > maximumAge) {
      throw new Error(`FX quote ${quote.baseCurrency}/${quote.quoteCurrency} is stale or from the future.`);
    }
  }

  private convert(money: Money, targetCurrency: string, quote: FxQuote | null): Money {
    if (money.currency === targetCurrency) return money;
    if (!quote) throw new Error(`Missing FX quote for ${money.currency}/${targetCurrency}.`);
    const increment = this.rules.fxRoundingIncrementMinor ?? 1;
    if (!Number.isSafeInteger(increment) || increment <= 0) throw new Error("FX rounding increment must be a positive safe integer.");
    const minorUnits = new Decimal(money.minorUnits)
      .mul(quote.rate)
      .div(increment)
      .toDecimalPlaces(0, decimalRounding(this.rules.rounding))
      .mul(increment)
      .toNumber();
    if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) throw new Error("Converted monetary amount is unsafe.");
    return { currency: targetCurrency, minorUnits };
  }

  private deliveryOptions(offer: OfferSnapshot): readonly DeliveryOption[] {
    if (offer.deliveryOptions?.length) return offer.deliveryOptions;
    return [DeliveryOptionSchema.parse({
      id: `legacy-delivery-${offer.id}`,
      label: "Delivery",
      price: offer.deliveryPrice,
      eligibility: "PASS",
      entitlementStatus: "PASS",
      observedAt: offer.observedAt,
      provenance: computedProvenance(`offer:${offer.id}:legacy-delivery`, offer.observedAt),
    })];
  }

  private couponCandidates(offer: OfferSnapshot, evidence: EvidenceBundle): readonly CouponCandidate[] {
    if (offer.couponCandidates) return offer.couponCandidates;
    const encoded = evidence.coupon.value?.trim();
    if (!encoded || encoded.toUpperCase() === "NONE" || evidence.coupon.result === "FAIL") return [];
    return encoded.split("+").map((code) => code.trim()).filter(Boolean).map((code) => {
      const rule = (this.rules.coupons ?? []).find((candidate) => candidate.code === code);
      return {
        code,
        appliesTo: rule?.appliesTo ?? "ITEM",
        amount: rule?.amount ?? { currency: offer.itemPrice.currency, minorUnits: 0 },
        eligibility: rule?.eligibility ?? (evidence.coupon.result === "UNKNOWN" || !rule ? "UNKNOWN" : "PASS"),
        eligibilityReason: rule?.eligibilityReason ?? (!rule ? "Coupon has no deterministic pricing rule" : null),
        thresholdBasis: rule?.thresholdBasis ?? "ITEM_BEFORE_DISCOUNTS",
        minimumSubtotal: rule?.minimumItemSubtotal ?? null,
        merchantIds: rule?.merchantIds ? [...rule.merchantIds] : undefined,
        sellerIds: rule?.sellerIds ? [...rule.sellerIds] : undefined,
        stackable: rule?.stackable ?? false,
        observedAt: rule?.observedAt ?? evidence.coupon.provenance.observedAt,
        expiresAt: rule?.expiresAt ?? null,
        provenance: computedProvenance(`coupon-rule:${code}`, rule?.observedAt ?? evidence.coupon.provenance.observedAt),
      } satisfies CouponCandidate;
    });
  }

  private powerSet<T>(values: readonly T[]): readonly (readonly T[])[] {
    return values.reduce<readonly (readonly T[])[]>((sets, value) => [
      ...sets,
      ...sets.map((set) => [...set, value]),
    ], [[]]);
  }

  private thresholdSubtotal(
    basis: DeliveryOption["thresholdBasis"],
    offer: OfferSnapshot,
    delivery: DeliveryOption,
    coupons: readonly CouponCandidate[],
  ): number {
    const includesDelivery = basis.startsWith("CART_");
    const afterDiscounts = basis.endsWith("_AFTER_DISCOUNTS");
    let item = offer.itemPrice.minorUnits;
    let deliveryMinor = delivery.price?.minorUnits ?? 0;
    if (afterDiscounts) {
      for (const coupon of coupons) {
        if (coupon.amount.currency !== offer.itemPrice.currency) continue;
        if (coupon.appliesTo === "ITEM") item = Math.max(0, item - coupon.amount.minorUnits);
        else deliveryMinor = Math.max(0, deliveryMinor - coupon.amount.minorUnits);
      }
    }
    return item + (includesDelivery ? deliveryMinor : 0);
  }

  private timestampRank(value: string | null): number {
    return value ? Date.parse(value) : Number.MAX_SAFE_INTEGER;
  }

  private preferenceRank(
    request: ShoppingRequest,
    delivery: DeliveryOption,
    preferredMethods?: readonly string[],
  ): number {
    const preferences = preferredMethods ?? request.preferences;
    const normalizedMethod = delivery.method.trim().toLocaleLowerCase("en-US");
    const normalizedLabel = delivery.label.trim().toLocaleLowerCase("en-US");
    const index = preferences.findIndex((preference) => {
      const normalized = preference.trim().toLocaleLowerCase("en-US");
      return normalized === normalizedMethod || normalized === normalizedLabel;
    });
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  }
}

export const headlineLandedCostRules: LandedCostRuleSet = {
  version: "headline-rules-v1",
  rounding: "HALF_UP",
  fxRoundingIncrementMinor: 10,
  maximumFxAgeMs: 5 * 60 * 1000,
  fxQuotes: [{
    baseCurrency: "GBP",
    quoteCurrency: "EUR",
    rate: "1.2203389831",
    observedAt: "2026-07-11T08:01:00.000Z",
  }],
  additionalCharges: [{
    code: "DUTY",
    label: "Scenario duty and handling",
    destinationCountry: "PL",
    sourceCurrency: "GBP",
    fixedAmount: { currency: "EUR", minorUnits: 300 },
  }],
};
