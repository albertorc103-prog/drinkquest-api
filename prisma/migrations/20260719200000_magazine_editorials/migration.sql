-- CreateEnum
CREATE TYPE "MagazineSection" AS ENUM ('STRONG', 'PARA_DATE');

-- CreateTable
CREATE TABLE "magazine_editorials" (
    "id" UUID NOT NULL,
    "section" "MagazineSection" NOT NULL,
    "title" TEXT NOT NULL,
    "teaser" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'EDITORIAL',
    "image_url" TEXT,
    "status_badge" TEXT NOT NULL DEFAULT 'EN BARRA',
    "eta_label" TEXT NOT NULL DEFAULT 'ESTA SEMANA',
    "bar_id" UUID,
    "drink_id" UUID,
    "venue_note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "magazine_editorials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "magazine_editorials_section_published_sort_order_idx" ON "magazine_editorials"("section", "published", "sort_order");
CREATE INDEX "magazine_editorials_published_at_idx" ON "magazine_editorials"("published_at");

-- AddForeignKey
ALTER TABLE "magazine_editorials" ADD CONSTRAINT "magazine_editorials_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "bars"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "magazine_editorials" ADD CONSTRAINT "magazine_editorials_drink_id_fkey" FOREIGN KEY ("drink_id") REFERENCES "drinks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed editorial samples (sin bar/drink; admin puede enlazar después)
INSERT INTO "magazine_editorials" ("id", "section", "title", "teaser", "category", "image_url", "status_badge", "eta_label", "venue_note", "sort_order", "published", "published_at", "updated_at")
VALUES
  (gen_random_uuid(), 'STRONG', 'Penicillin', 'Whisky escocés, lima, miel-jengibre y capa de Islay ahumado. Trago potente de la semana en DrinkQuest.', 'WHISKY', 'https://images.unsplash.com/photo-1527281170201-7eef9a4123b9?w=800&q=85', 'TRAGO DE LA SEMANA', 'ESTA SEMANA', 'Hotspot nocturno', 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'STRONG', 'Zombie Tiki', 'Varios rones, cítricos y especias en versión limitada. Máximo dos por persona.', 'TROPICAL', 'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=800&q=85', 'PRÓXIMAMENTE', 'PRÓXIMA SEMANA', 'Preventa en copa tiki', 20, true, NOW(), NOW()),
  (gen_random_uuid(), 'STRONG', 'B-52', 'Capas de Kahlúa, Baileys y Grand Marnier. Ritual de shot ideal para retos de grupo.', 'SHOT', 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800&q=85', 'EN BARRA', 'EN BARRA', 'Viernes y sábado', 30, true, NOW(), NOW()),
  (gen_random_uuid(), 'PARA_DATE', 'Espresso Martini', 'Vodka, café y licor de café. Elegante para una cita nocturna con XP extra.', 'CAFÉ', 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&q=85', 'DATE NIGHT', 'ESTA SEMANA', 'Terraza al atardecer', 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'PARA_DATE', 'French 75', 'Gin, limón, azúcar y champagne. Clásico romántico para brindar.', 'GIN', 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=800&q=85', 'EN BARRA', 'FIN DE SEMANA', 'Bar íntimo', 20, true, NOW(), NOW()),
  (gen_random_uuid(), 'PARA_DATE', 'Paloma Rosa', 'Tequila, toronja y toque floral. Ideal para compartir en rooftop.', 'TEQUILA', 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=85', 'RECOMENDADO', 'ESTA SEMANA', 'Vista ciudad', 30, true, NOW(), NOW());
