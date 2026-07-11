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
  image: { src: string; alt: string; attribution: string; width: number; height: number };
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
    image: {
      src: "/products/nike-dunk-low.jpg",
      alt: "Nike Dunk Low Retro White/Black \"Panda\" sneaker",
      attribution: "Premeditated, CC BY-SA 4.0, via Wikimedia Commons",
      width: 960,
      height: 1280,
    },
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
    image: {
      src: "/products/iittala-aalto-vase.jpg",
      alt: "Iittala Aalto clear glass vase by Alvar Aalto",
      attribution: "Finna.fi / Wikimedia Commons, CC BY 4.0",
      width: 640,
      height: 599,
    },
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
    image: {
      src: "/products/macbook-air.jpg",
      alt: "Apple MacBook Air 13-inch, silver (same chassis as the M3 generation)",
      attribution: "AzureSaturn, CC0, via Wikimedia Commons",
      width: 960,
      height: 720,
    },
  },
];

export const presentationProductById = new Map(
  presentationProducts.map((profile) => [profile.id, profile] as const),
);

export const presentationProductByIdentifier = new Map(
  presentationProducts.map((profile) => [profile.identifier.value, profile] as const),
);
