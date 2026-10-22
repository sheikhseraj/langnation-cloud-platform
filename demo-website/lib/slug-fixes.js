// The old admin saved several page slugs with typos, and one page ("LangNation")
// was really the About page. These are the corrections applied on the new site.
//
// Shared between lib/content.js (which renames the pages and keeps the original
// as `legacySlug` for the 301 redirect) and tools/extract-old-content.js (which
// needs the final slug when rewriting links found inside body copy).
//
// Keys are the old slug, values the new one. Adding an entry automatically
// creates a redirect from the old URL.
"use strict";

module.exports = {
  "privacy-plolicy": "privacy-policy",
  "terms-and-condtions": "terms-and-conditions",
  "studenst-s-terms-and-condtions": "student-terms-and-conditions",
  "legal-discloser": "legal-disclosure",
  gymnasiam: "gymnasium",
  "grade-convertor": "grade-converter",
  "ects-convertor": "ects-converter",
  langnation: "about",
  "our-visions": "our-vision",
};
