# Disclosed demo catalog

The Person B matcher uses a deliberately small canonical catalog for the deterministic hackathon demo. It is not a general Nike catalog and must not be presented as live merchant data.

## Canonical headline product

- Canonical ID: `nike-dunk-low-retro-white-black`
- Brand/model: Nike Dunk Low
- Headline MPN: `DD1391-100`
- Normalized attributes: adult, low silhouette, white/black colorway
- Disclosed aliases: `Nike Dunk Low Retro White Black`, `Nike Dunk Low Panda`, and `Dunk Low Black White`
- Fixture-only Warsaw merchant SKU: `WAW-DUNK-PANDA`

## Deliberate near matches

The catalog includes fixture-only Dunk High, SB Dunk Low, Dunk Low GS, and Dunk Low Next Nature records. Their `FIXTURE-*` identifiers exist only to exercise contradictions and must not be treated as real manufacturer identifiers.

Every alias resolution is marked with `SEEDED` provenance. Normalized matches are computed from brand/model tokens, and AI-assisted claims are marked separately with prompt, output-schema, model/cache, response, and input provenance.
