ALTER TABLE games
ADD COLUMN bullet_target INTEGER NOT NULL DEFAULT 100 CHECK (
	bullet_target BETWEEN 30 AND 200
	AND bullet_target % 10 = 0
);
