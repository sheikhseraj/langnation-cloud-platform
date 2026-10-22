# Local community cover images

Priority: groups/<existing-group-slug> → cities/<normalized-city> → default.webp.
Supported extensions in order: .webp, .jpg, .jpeg, .png.
Example city files: cities/berlin.webp, cities/magdeburg.webp, cities/erlangen.webp.
Add more cities by placing their image here; no code edit is required. Normalize city to lowercase, remove accents, replace spaces/punctuation with hyphens (München → munchen). Use the exact group's city field.
Optional custom cover: groups/indians-in-magdeburg.webp. This is a separate static cover override; it never replaces the uploaded circular logo.
Suggested size: 1000 × 500 or larger landscape. Existing fixed card height/object-fit: cover remains unchanged.
No external image requests at page load.

Sources
- Berlin: reused existing public/img/site/germany-900.webp.
- Magdeburg: Valentin Suhr, public-domain dedication: https://commons.wikimedia.org/wiki/File:Magdeburger_Dom_00586.JPG
- Erlangen: Ghormax, public-domain dedication: https://commons.wikimedia.org/wiki/File:Erlangen_Schloss.jpg
- Default: original generic skyline SVG, rasterized locally.
Photos resized/cropped to 1000 × 500 and encoded as WebP with the existing sharp dependency.
