-- 0014_cue_sounds.sql — the 3-2-1 / completion / rest-zero cue tones (§10.8) become a user
-- setting. Default 1 (on), which is the behaviour every existing install already has, so no row
-- changes meaning. Haptics are not covered by this and stay unconditional: muting is about not
-- making noise, not about training without cues.

ALTER TABLE users ADD COLUMN cue_sounds_enabled INTEGER NOT NULL DEFAULT 1;
