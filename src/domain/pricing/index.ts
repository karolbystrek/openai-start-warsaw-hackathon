import Decimal from "decimal.js";

import {
  LandedCostSchema,
  type EvidenceBundle,
  type LandedCost,
  type LandedCostLine,
  type Money,
  type OfferSnapshot,
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
    const budgetCurrency = request.requirements.maximumLandedCost.currency;
    const sourceCurrencies = new Set([offer.itemPrice.currency, offer.deliveryPrice.currency]);
    if (sourceCurrencies.size > 1) {
      throw new Error("Item and delivery prices must use the same source currency in trust-core-v1.");
    }

    const sourceCurrency = offer.itemPrice.currency;
    const quote = this.findQuote(sourceCurrency, budgetCurrency);
    if (quote) this.assertFreshQuote(quote, offer.observedAt);
    const observedAt = offer.observedAt;
    const lines: LandedCostLine[] = [];
    const item = this.convert(offer.itemPrice, budgetCurrency, quote);
    const delivery = this.convert(offer.deliveryPrice, budgetCurrency, quote);

    lines.push({
      code: sourceCurrency === budgetCurrency ? "ITEM" : "FX",
      label: sourceCurrency === budgetCurrency ? "Item" : `Item converted from ${sourceCurrency}`,
      amount: item,
      operation: sourceCurrency === budgetCurrency ? "ADD" : "CONVERT",
      provenance: sourceCurrency === budgetCurrency
        ? computedProvenance(`offer:${offer.id}:item`, observedAt)
        : computedProvenance(`fx:${sourceCurrency}/${budgetCurrency}@${quote?.rate}`, quote?.observedAt ?? observedAt),
    });
    lines.push({
      code: "DELIVERY",
      label: sourceCurrency === budgetCurrency ? "Delivery" : `Delivery converted from ${sourceCurrency}`,
      amount: delivery,
      operation: "ADD",
      provenance: sourceCurrency === budgetCurrency
        ? computedProvenance(`offer:${offer.id}:delivery`, observedAt)
        : computedProvenance(`fx:${sourceCurrency}/${budgetCurrency}@${quote?.rate}`, quote?.observedAt ?? observedAt),
    });

    let total = item.minorUnits + delivery.minorUnits;
    let itemRemaining = item.minorUnits;
    let deliveryRemaining = delivery.minorUnits;
    for (const coupon of this.resolveCoupons(offer, evidence, budgetCurrency)) {
      const eligibleRemaining = coupon.appliesTo === "ITEM" ? itemRemaining : deliveryRemaining;
      const couponMinor = Math.min(coupon.amount.minorUnits, eligibleRemaining);
      lines.push({
        code: coupon.appliesTo === "ITEM" ? "ITEM_COUPON" : "DELIVERY_COUPON",
        label: `Coupon ${coupon.code}`,
        amount: { currency: budgetCurrency, minorUnits: couponMinor },
        operation: "SUBTRACT",
        provenance: computedProvenance(`coupon-rule:${coupon.code}`, evidence.coupon.provenance.observedAt),
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
        provenance: computedProvenance(`charge-rule:${this.rules.version}`, observedAt),
      });
      total += charge.fixedAmount.minorUnits;
    }

    return LandedCostSchema.parse({
      schemaVersion: 1,
      id: `landed-${offer.id}-${this.rules.version}`,
      offerId: offer.id,
      budgetCurrency,
      lines,
      total: { currency: budgetCurrency, minorUnits: total },
      fxRate: quote?.rate ?? null,
      fxObservedAt: quote?.observedAt ?? null,
      ruleVersion: this.rules.version,
      provenance: computedProvenance(`landed-cost:${this.rules.version}`, observedAt),
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

  private resolveCoupons(
    offer: OfferSnapshot,
    evidence: EvidenceBundle,
    budgetCurrency: string,
  ): readonly CouponRule[] {
    const encodedCodes = evidence.coupon.value?.trim();
    if (!encodedCodes || encodedCodes.toUpperCase() === "NONE" || evidence.coupon.result !== "PASS") return [];
    const codes = encodedCodes.split("+").map((code) => code.trim()).filter(Boolean);
    const coupons = codes.map((code) => {
      const coupon = (this.rules.coupons ?? []).find((candidate) => candidate.code === code);
      if (!coupon) throw new Error(`Coupon ${code} is marked valid but has no pricing rule.`);
      assertCurrency(coupon.amount, budgetCurrency, `Coupon ${code}`);
      if (coupon.merchantIds && !coupon.merchantIds.includes(offer.merchantId)) {
        throw new Error(`Coupon ${code} does not apply to merchant ${offer.merchantId}.`);
      }
      if (coupon.minimumItemSubtotal) {
        assertCurrency(coupon.minimumItemSubtotal, offer.itemPrice.currency, `Coupon ${code} minimum subtotal`);
        if (offer.itemPrice.minorUnits < coupon.minimumItemSubtotal.minorUnits) {
          throw new Error(`Coupon ${code} minimum subtotal is not met.`);
        }
      }
      return coupon;
    });
    if (coupons.length > 1 && coupons.some((coupon) => coupon.stackable !== true)) {
      throw new Error(`Coupon combination ${encodedCodes} is not stackable.`);
    }
    return coupons;
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
