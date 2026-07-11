import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { checkpointApplication } from "@/application/container";
import { formatMoney } from "@/app/format-money";
import { merchantName, recommendationReasons } from "@/app/product-presentation";
import { presentationProducts } from "@/domain/catalog/presentation-products";
import type { DecisionRecord, OfferSnapshot } from "@/domain/contracts";
import { fixtureScenarioSource } from "@/simulator/scenarios";

export const dynamic = "force-dynamic";

function fixtureOffer(offerId: string): OfferSnapshot | null {
  for (const summary of fixtureScenarioSource.list()) {
    const event = fixtureScenarioSource.get(summary.id).events.find((candidate) => (
      candidate.type === "OFFER_OBSERVED" && candidate.offer.id === offerId
    ));
    if (event?.type === "OFFER_OBSERVED") return event.offer;
  }
  return null;
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ offerId: string }>;
  searchParams: Promise<{ chat?: string }>;
}) {
  const [{ offerId }, { chat }] = await Promise.all([params, searchParams]);
  const state = await checkpointApplication.getSimulationState();
  const decision: DecisionRecord | null = state.decisions.find((candidate) => candidate.offer.id === offerId) ?? null;
  const offer = decision?.offer ?? fixtureOffer(offerId);
  if (!offer) notFound();

  const profile = presentationProducts.find((candidate) => (
    candidate.brand === offer.attributes.brand
    && (offer.attributes.model?.includes(candidate.model) || candidate.model.includes(offer.attributes.model ?? ""))
  ));
  const total = decision?.landedCost?.total
    ?? (offer.itemPrice.currency === offer.deliveryPrice.currency
      ? { currency: offer.itemPrice.currency, minorUnits: offer.itemPrice.minorUnits + offer.deliveryPrice.minorUnits }
      : null);
  const reasons = decision ? recommendationReasons(decision).slice(0, 6) : [];
  const backHref = chat ? `/?chat=${encodeURIComponent(chat)}` : "/";

  return (
    <main className="product-page">
      <header className="product-page-header">
        <Link className="back-link" href={backHref}>← Back to recommendation</Link>
        <span>Product details</span>
      </header>

      <article className="product-detail-card">
        {profile ? (
          <div className="product-detail-image">
            <Image src={profile.image.src} alt={profile.image.alt} fill sizes="(max-width: 700px) 100vw, 420px" priority />
          </div>
        ) : null}
        <div className="product-detail-copy">
          <p className="card-label">{merchantName(offer.merchantId)}</p>
          <h1>{offer.title}</h1>
          {total ? <strong className="product-total">{formatMoney(total.currency, total.minorUnits)} delivered</strong> : null}
          <dl>
            <div><dt>Model</dt><dd>{offer.attributes.model ?? "Not stated"}</dd></div>
            <div><dt>Variant</dt><dd>{offer.attributes.size ?? "Standard"}</dd></div>
            <div><dt>Condition</dt><dd>{offer.attributes.condition ?? "Not stated"}</dd></div>
            <div><dt>Availability</dt><dd>{decision?.evidence.stock.value === "IN_STOCK" ? "In stock" : decision?.evidence.stock.value ?? "Fixture availability"}</dd></div>
            <div><dt>Delivery to</dt><dd>{offer.destinationCountries.join(", ")}</dd></div>
          </dl>

          <section className="product-reasons" aria-labelledby="product-reasons-title">
            <h2 id="product-reasons-title">Why this product was suggested</h2>
            {reasons.length ? (
              <ul>{reasons.map((reason) => <li key={reason}>✓ {reason}</li>)}</ul>
            ) : <p>This product is part of the deterministic shopping demo and matches the selected presentation profile.</p>}
          </section>

          {profile ? (
            <a className="product-external-link" href={profile.productUrl} target="_blank" rel="noopener noreferrer">
              {profile.productLinkLabel} ↗
            </a>
          ) : null}
          <p className="product-fixture-note">The recommendation price is simulated. Check the retailer page for the current price, stock, delivery, and exact configuration before buying.</p>
        </div>
      </article>
    </main>
  );
}
