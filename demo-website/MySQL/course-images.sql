-- Course photographs, as paths.
--
-- Written by tools/import-images.js on 2026-09-21.
-- Not a migration: it changes no schema, it is safe to run twice, and
-- it is rewritten every time pictures are imported. That is why it has
-- no number in its name.
--
-- Needed because courses come from the database wherever one is
-- configured. content/courses.json is only what the site falls back to
-- when there is none, so updating the files alone leaves the live site
-- pointing at whatever the editor last saved.
--
-- Every row is set for BOTH languages: the picture is the same one
-- whichever language the page is in.

UPDATE `courses` SET `image_src` = '/img/courses/intensive-courses-1400.webp',
       `image_srcset` = '/img/courses/intensive-courses-400.webp 400w, /img/courses/intensive-courses-800.webp 800w, /img/courses/intensive-courses-1400.webp 1400w'
 WHERE `slug` = 'intensive-courses';

UPDATE `courses` SET `image_src` = '/img/courses/individual-training-a2-1400.webp',
       `image_srcset` = '/img/courses/individual-training-a2-400.webp 400w, /img/courses/individual-training-a2-800.webp 800w, /img/courses/individual-training-a2-1400.webp 1400w'
 WHERE `slug` = 'individual-training-a2';

UPDATE `courses` SET `image_src` = '/img/courses/individual-training-a1-1400.webp',
       `image_srcset` = '/img/courses/individual-training-a1-400.webp 400w, /img/courses/individual-training-a1-800.webp 800w, /img/courses/individual-training-a1-1400.webp 1400w'
 WHERE `slug` = 'individual-training-a1';

UPDATE `courses` SET `image_src` = '/img/courses/german-regular-a1-1400.webp',
       `image_srcset` = '/img/courses/german-regular-a1-400.webp 400w, /img/courses/german-regular-a1-800.webp 800w, /img/courses/german-regular-a1-1400.webp 1400w'
 WHERE `slug` = 'german-regular-a1';

UPDATE `courses` SET `image_src` = '/img/courses/german-regular-a2-1400.webp',
       `image_srcset` = '/img/courses/german-regular-a2-400.webp 400w, /img/courses/german-regular-a2-800.webp 800w, /img/courses/german-regular-a2-1400.webp 1400w'
 WHERE `slug` = 'german-regular-a2';

UPDATE `courses` SET `image_src` = '/img/courses/german-regular-b1-1400.webp',
       `image_srcset` = '/img/courses/german-regular-b1-400.webp 400w, /img/courses/german-regular-b1-800.webp 800w, /img/courses/german-regular-b1-1400.webp 1400w'
 WHERE `slug` = 'german-regular-b1';

UPDATE `courses` SET `image_src` = '/img/courses/german-regular-b2-1400.webp',
       `image_srcset` = '/img/courses/german-regular-b2-400.webp 400w, /img/courses/german-regular-b2-800.webp 800w, /img/courses/german-regular-b2-1400.webp 1400w'
 WHERE `slug` = 'german-regular-b2';

UPDATE `courses` SET `image_src` = '/img/courses/german-regular-c1-1400.webp',
       `image_srcset` = '/img/courses/german-regular-c1-400.webp 400w, /img/courses/german-regular-c1-800.webp 800w, /img/courses/german-regular-c1-1400.webp 1400w'
 WHERE `slug` = 'german-regular-c1';

UPDATE `courses` SET `image_src` = '/img/courses/german-regular-c2-1400.webp',
       `image_srcset` = '/img/courses/german-regular-c2-400.webp 400w, /img/courses/german-regular-c2-800.webp 800w, /img/courses/german-regular-c2-1400.webp 1400w'
 WHERE `slug` = 'german-regular-c2';
