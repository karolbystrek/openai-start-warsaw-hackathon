export type PresentationProductId = "shoes" | "vase" | "macbook";

export interface PresentationProductProfile {
  id: PresentationProductId;
  label: string;
  canonicalProductId: string;
  brand: string;
  model: string;
  category: string;
  requiredVariant: string;
  identifier: { type: "MPN"; value: string };
  maximumLandedCost: { currency: "EUR"; minorUnits: number };
  brief: string;
}

export const presentationProducts: readonly PresentationProductProfile[] = [
  {
    id: "shoes",
    label: "Nike shoes",
    canonicalProductId: "nike-dunk-low-retro-white-black",
    brand: "Nike",
    model: "Dunk Low",
    category: "shoes",
    requiredVariant: "EU 43",
    identifier: { type: "MPN", value: "DD1391-100" },
    maximumLandedCost: { currency: "EUR", minorUnits: 8_000 },
    brief: "Nike Dunk Low, EU 43, under EUR 80 delivered to Poland. New only, no resellers. Notify me once.",
  },
  {
    id: "vase",
    label: "Aalto vase",
    canonicalProductId: "iittala-aalto-vase-160-clear",
    brand: "Iittala",
    model: "Aalto Vase",
    category: "home-decor",
    requiredVariant: "160 mm clear glass",
    identifier: { type: "MPN", value: "FIXTURE-IITTALA-AALTO-160-CLEAR" },
    maximumLandedCost: { currency: "EUR", minorUnits: 14_000 },
    brief: "Iittala Aalto vase, 160 mm, clear glass, under EUR 140 delivered to Poland. New only, no resellers. Notify me once.",
  },
  {
    id: "macbook",
    label: "MacBook Air",
    canonicalProductId: "apple-macbook-air-m3-13-16-512",
    brand: "Apple",
    model: "MacBook Air M3",
    category: "laptops",
    requiredVariant: "13-inch 16 GB RAM 512 GB SSD",
    identifier: { type: "MPN", value: "FIXTURE-MBA-M3-13-16-512" },
    maximumLandedCost: { currency: "EUR", minorUnits: 130_000 },
    brief: "Apple MacBook Air 13-inch M3, 16 GB RAM, 512 GB SSD, under EUR 1300 delivered to Poland. New only, no resellers. Notify me once.",
  },
];

export const presentationProductById = new Map(
  presentationProducts.map((profile) => [profile.id, profile] as const),
);
