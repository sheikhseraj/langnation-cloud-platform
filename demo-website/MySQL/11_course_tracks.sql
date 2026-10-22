-- Give every course its track.
--
-- The column has existed since the content schema went in and the
-- editor has always offered a Track dropdown, but the import from the
-- old site had nothing to put in it — every row came across with the
-- column empty or on its 'Regular' default. So the back office could
-- not group courses by anything, and the batch picker was one flat
-- list of nine titles with no way to see that six of them are the same
-- course at different levels.
--
-- Derived from the slug, which is the one field that has always said
-- what kind of course it is. Only these known slug shapes are touched;
-- anything added later keeps whatever the editor set.

UPDATE `courses` SET `track` = 'Regular'    WHERE `slug` LIKE 'german-regular-%';
UPDATE `courses` SET `track` = 'Weekend'    WHERE `slug` LIKE 'german-weekend-%';
UPDATE `courses` SET `track` = 'Speaking'   WHERE `slug` LIKE 'german-speaking-%';
UPDATE `courses` SET `track` = 'Individual' WHERE `slug` LIKE 'individual-training-%';
UPDATE `courses` SET `track` = 'Intensive'  WHERE `slug` = 'intensive-courses';

-- Anything the slug does not identify. Left as 'Regular' would be a
-- quiet lie; 'Other' at least shows up in its own group and asks to be
-- looked at.
UPDATE `courses` SET `track` = 'Other'
 WHERE (`track` IS NULL OR `track` = '')
   AND `slug` NOT LIKE 'german-regular-%'
   AND `slug` NOT LIKE 'german-weekend-%'
   AND `slug` NOT LIKE 'german-speaking-%'
   AND `slug` NOT LIKE 'individual-training-%'
   AND `slug` <> 'intensive-courses';

SELECT `track`, COUNT(*) AS courses FROM `courses` WHERE `lang` = 'en' GROUP BY `track`;
