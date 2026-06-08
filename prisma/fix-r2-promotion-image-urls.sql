-- Corrige image_url con prefijo /drinkquest/ en dominios R2 públicos (.r2.dev).
-- Ejemplo: https://pub-xxx.r2.dev/drinkquest/feed/uuid.jpg → https://pub-xxx.r2.dev/feed/uuid.jpg

UPDATE bar_promotions
SET
  image_url = REPLACE(image_url, '.r2.dev/drinkquest/', '.r2.dev/'),
  updated_at = NOW()
WHERE image_url LIKE '%.r2.dev/drinkquest/%';
