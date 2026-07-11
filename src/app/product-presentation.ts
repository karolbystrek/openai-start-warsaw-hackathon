import type { DecisionRecord } from "@/domain/contracts";

export function merchantName(merchantId: string): string {
  const knownMerchants: Record<string, string> = {
    "iittala-official": "Iittala",
    "macbook-merchant-valid": "Media Expert",
    "mediaexpert-pl": "Media Expert",
    "merchant-warsaw-sneakers": "Warsaw Sneakers",
    "vase-merchant-valid": "Iittala",
  };
  return knownMerchants[merchantId]
    ?? merchantId.replace(/^merchant-/, "").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function recommendationReasons(decision: DecisionRecord): string[] {
  const passed = new Set(
    decision.requirements
      .filter((requirement) => requirement.result === "PASS")
      .map((requirement) => requirement.requirement),
  );
  const reasons: string[] = [];
  if (passed.has("identity")) reasons.push("It is the exact product you requested.");
  if (passed.has("size")) reasons.push(`The required variant matches: ${decision.offer.attributes.size ?? "standard"}.`);
  if (passed.has("condition")) reasons.push(`Its condition matches: ${decision.offer.attributes.condition?.toLowerCase() ?? "as requested"}.`);
  if (passed.has("seller")) reasons.push("The seller passed verification.");
  if (passed.has("stock")) reasons.push("It is currently in stock.");
  if (passed.has("destination")) reasons.push(`It can be delivered to ${decision.offer.destinationCountries.join(", ")}.`);
  if (passed.has("landed-cost-cap")) reasons.push("The complete delivered price is within your budget.");
  return reasons;
}
