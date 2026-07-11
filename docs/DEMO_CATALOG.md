# Disclosed demo catalog

The Person B matcher uses a deliberately scoped canonical catalog for the deterministic hackathon demo. It is mock fixture data and must not be presented as a complete catalog or live merchant data.

## Canonical headline product

- Canonical ID: `nike-dunk-low-retro-white-black`
- Brand/model: Nike Dunk Low
- Headline MPN: `DD1391-100`
- Normalized attributes: adult, low silhouette, white/black colorway
- Disclosed aliases: `Nike Dunk Low Retro White Black`, `Nike Dunk Low Panda`, and `Dunk Low Black White`
- Fixture-only Warsaw merchant SKU: `WAW-DUNK-PANDA`

## Deliberate near matches

The catalog includes fixture-only Dunk High, SB Dunk Low, Dunk Low GS, and Dunk Low Next Nature records. Their `FIXTURE-*` identifiers exist only to exercise contradictions and must not be treated as real manufacturer identifiers.

## Additional shopping branches

The mock catalog also contains paired products in six additional shopping branches. Each target has a plausible sibling model so deterministic matching can exercise both valid identity and wrong-model paths:

- Electronics: Sony WH-1000XM5 and WH-1000XM4 wireless headphones.
- Gaming: Nintendo Switch OLED and standard Nintendo Switch consoles.
- Home appliances: Dyson V15 Detect and V12 Detect Slim vacuum cleaners.
- Kitchen appliances: Sage Barista Express and Barista Pro espresso machines.
- Sports tech: Garmin Forerunner 265 and 265S running watches.
- Toys: LEGO Technic Mercedes-AMG F1 W14 and McLaren Formula 1 construction sets.

All identifiers for these additional products use the `FIXTURE-*` prefix and are intentionally mock values. The names and aliases exist to exercise catalog matching; they are not claims about current availability, pricing, or official merchant data.

Every alias resolution is marked with `SEEDED` provenance. Normalized matches are computed from brand/model tokens, and AI-assisted claims are marked separately with prompt, output-schema, model/cache, response, and input provenance.
