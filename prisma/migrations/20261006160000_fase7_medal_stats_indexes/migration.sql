-- FASE 7: índices para stats de medallas (season unlocks + visitas por bar)
CREATE INDEX IF NOT EXISTS "user_bar_medals_season_id_unlocked_at_idx"
  ON "user_bar_medals" ("season_id", "unlocked_at");

CREATE INDEX IF NOT EXISTS "place_visits_bar_id_visited_at_idx"
  ON "place_visits" ("bar_id", "visited_at");
