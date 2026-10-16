# ApeRadar Next

An independent, local-first battle intelligence companion. The interface uses calm maritime colors, precise numbers, readable tables and restrained motion. Synthetic examples are always marked. No claim is made to predict a battle's outcome.

Chinese is the default language. Labels describe data and explain recovery actions: 精英、熟练、标准、海猴、战绩隐藏、查询失败. Hidden profiles are separate from unavailable requests. Rating labels follow the project terminology.

Font Awesome Free provides interface icons and the unknown-ship fallback. The five ship classes use SVG redrawings of the World of Warships UI symbols in `apps/web/src/assets/ship-types/`. Preserve their game silhouettes and distinctive internal markings as solid paths and transparent cutouts; do not embed raster images or add bevels or blur. These are project redrawings, not official SVG assets. `sources.json` records the SVG filenames, original Wiki PNG references, URLs and reference SHA-256 digests. Light mode inverts the white vectors for contrast; dark mode displays them in white. The application mark and desktop icons use the Font Awesome satellite-dish glyph on the teal brand background. All icons, images, CSS and the Inter font are bundled locally; no remote imagery, icon CDN, web fonts or telemetry are needed. Chinese uses system font fallbacks. Decorative icons are hidden from assistive technology; icon buttons retain accessible labels, and watched players use a filled star instead of the outline star.

Visual identity: navy navigation; off-white workspace; deep teal actions; blue allies; amber opponents; purple elite records. Team names and series styles supplement colors. Dark mode uses lighter semantic colors, never a simple inversion.

Source of truth: `apps/web/assets/design-tokens.css` (primitive → semantic → component); `design-system/aperadar-next/MASTER.md` documents use and component states. Raw colors stay in the primitive layer and app-shell metadata.
