# Plate masters

The full-resolution originals behind the three movements of the arc. They are
kept out of `public/` so they are never deployed: the browser is served the
resized AVIF/WebP/JPEG variants in `public/plates/` instead.

Regenerate the variants after replacing a master:

    node scripts/build-plates.mjs
