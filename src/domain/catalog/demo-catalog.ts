import { z } from "zod";

const CatalogIdentifierSchema = z.object({
  type: z.enum(["GTIN", "EAN", "UPC", "MPN", "SKU"]),
  value: z.string().min(1),
  merchantId: z.string().min(1).optional(),
  fixtureOnly: z.boolean().default(false),
});

export const CatalogProductSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  category: z.string().min(1),
  attributes: z.record(z.string(), z.string()),
  identifiers: z.array(CatalogIdentifierSchema),
  aliases: z.array(z.string().min(1)),
});
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;

const product = (value: CatalogProduct) => CatalogProductSchema.parse(value);

export const demoCatalog: readonly CatalogProduct[] = [
  product({
    id: "nike-dunk-low-retro-white-black",
    brand: "Nike",
    model: "Dunk Low",
    category: "shoes",
    attributes: { audience: "adult", silhouette: "low", colorway: "white-black" },
    identifiers: [
      { type: "MPN", value: "DD1391-100", fixtureOnly: false },
      { type: "SKU", value: "WAW-DUNK-PANDA", merchantId: "merchant-warsaw-sneakers", fixtureOnly: true },
    ],
    aliases: ["nike dunk low retro white black", "nike dunk low panda", "dunk low black white"],
  }),
  product({
    id: "nike-dunk-high-demo",
    brand: "Nike",
    model: "Dunk High",
    category: "shoes",
    attributes: { audience: "adult", silhouette: "high", colorway: "white-black" },
    identifiers: [{ type: "MPN", value: "FIXTURE-DUNK-HIGH", fixtureOnly: true }],
    aliases: ["nike dunk high", "dunk high white black"],
  }),
  product({
    id: "nike-sb-dunk-low-demo",
    brand: "Nike",
    model: "SB Dunk Low",
    category: "shoes",
    attributes: { audience: "adult", silhouette: "low", line: "sb" },
    identifiers: [{ type: "MPN", value: "FIXTURE-SB-DUNK", fixtureOnly: true }],
    aliases: ["nike sb dunk low", "sb dunk low"],
  }),
  product({
    id: "nike-dunk-low-gs-demo",
    brand: "Nike",
    model: "Dunk Low GS",
    category: "shoes",
    attributes: { audience: "grade-school", silhouette: "low" },
    identifiers: [{ type: "MPN", value: "FIXTURE-DUNK-GS", fixtureOnly: true }],
    aliases: ["nike dunk low gs", "dunk low kids", "dunk low grade school"],
  }),
  product({
    id: "nike-dunk-low-next-nature-demo",
    brand: "Nike",
    model: "Dunk Low Next Nature",
    category: "shoes",
    attributes: { audience: "adult", silhouette: "low", line: "next-nature" },
    identifiers: [{ type: "MPN", value: "FIXTURE-DUNK-NN", fixtureOnly: true }],
    aliases: ["nike dunk low next nature", "dunk low nn"],
  }),
];

export const disclosedSeededMappings = demoCatalog.flatMap((entry) => entry.aliases.map((alias) => ({
  alias,
  canonicalProductId: entry.id,
  provenance: "Disclosed hackathon demo alias; not an independently verified merchant mapping.",
})));
