-- 0035_bands_set_up.sql — Track 40: Your bands left first-launch setup. Generate now offers it the
-- first time Resistance bands is ticked, so it needs to know whether the user has ever chosen their
-- bands. Every existing row went through a setup that asked (or predates it), so it counts as set
-- up; a new row starts at 0.

ALTER TABLE users ADD COLUMN bands_set_up INTEGER NOT NULL DEFAULT 0;
UPDATE users SET bands_set_up = 1;
