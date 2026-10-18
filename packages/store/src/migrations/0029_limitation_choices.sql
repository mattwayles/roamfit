-- 0029_limitation_choices.sql — Track 37a: the plain-language limitation choices a user picked in
-- onboarding or Settings (LIMITATION_CHOICES in packages/data), as a JSON array of
-- {"id": "<choice id>", "since": "<local_date>"}. Choice ids, not tags, are stored so that a later
-- review of a choice's tag mapping reaches every user who already picked it; buildUserProfile
-- expands them into engine limitations. The limitations table stays for dated, tag-level rows.

ALTER TABLE users ADD COLUMN limitation_choices TEXT NOT NULL DEFAULT '[]';
