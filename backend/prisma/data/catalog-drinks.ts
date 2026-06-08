import { DrinkRarity } from '@prisma/client';

export type DemoDrinkSeed = {
  legacyId: number;
  slug: string;
  name: string;
  categorySlug: string;
  rarity: DrinkRarity;
  description: string;
  ingredients: string;
  imageUrl: string;
  xpReward: number;
  baseAlcohol?: string;
  containsMezcal?: boolean;
  isPalomaFamily?: boolean;
};

export const CATEGORIES = [
  { slug: 'cocktails', name: 'Cocktails', sortOrder: 1 },
  { slug: 'beer', name: 'Beer', sortOrder: 2 },
  { slug: 'wine', name: 'Wine', sortOrder: 3 },
  { slug: 'whiskey', name: 'Whiskey', sortOrder: 4 },
  { slug: 'tequila', name: 'Tequila', sortOrder: 5 },
  { slug: 'vodka', name: 'Vodka', sortOrder: 6 },
  { slug: 'gin', name: 'Gin', sortOrder: 7 },
  { slug: 'rum', name: 'Rum', sortOrder: 8 },
  { slug: 'mezcal', name: 'Mezcal', sortOrder: 9 },
  { slug: 'non-alcoholic', name: 'Non Alcoholic', sortOrder: 10 },
] as const;

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['\u2019\u2018]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function xpFor(rarity: DrinkRarity): number {
  switch (rarity) {
    case DrinkRarity.LEGENDARY:
      return 100;
    case DrinkRarity.EPIC:
      return 50;
    case DrinkRarity.RARE:
      return 25;
    default:
      return 10;
  }
}

function placeholderImage(name: string): string {
  const label = encodeURIComponent(name.replace(/\s+/g, '+'));
  return `https://placehold.co/400x600/1a1a2e/eaeaea?text=${label}`;
}

function drink(
  legacyId: number,
  name: string,
  categorySlug: string,
  rarity: DrinkRarity,
  description: string,
  ingredients: string,
  extra?: Pick<DemoDrinkSeed, 'baseAlcohol' | 'containsMezcal' | 'isPalomaFamily'>,
): DemoDrinkSeed {
  const slug = slugify(name);
  return {
    legacyId,
    slug,
    name,
    categorySlug,
    rarity,
    description,
    ingredients,
    imageUrl: placeholderImage(name),
    xpReward: xpFor(rarity),
    ...extra,
  };
}

export const DEMO_DRINKS: DemoDrinkSeed[] = [
  // Cocktails — populares y clásicos de barra
  drink(
    1,
    'Mojito',
    'cocktails',
    DrinkRarity.COMMON,
    'Cóctel cubano refrescante con ron blanco, menta y lima.',
    'Ron blanco, menta fresca, lima, azúcar, soda',
    { baseAlcohol: 'Rum' },
  ),
  drink(
    2,
    'Margarita',
    'cocktails',
    DrinkRarity.COMMON,
    'Clásico mexicano con tequila, triple sec y lima en copa escarchada.',
    'Tequila blanco, triple sec, jugo de lima, sal',
    { baseAlcohol: 'Tequila' },
  ),
  drink(
    3,
    'Piña Colada',
    'cocktails',
    DrinkRarity.COMMON,
    'Tropical cremoso con ron, piña y coco, icono caribeño.',
    'Ron blanco, crema de coco, jugo de piña',
    { baseAlcohol: 'Rum' },
  ),
  drink(
    4,
    'Moscow Mule',
    'cocktails',
    DrinkRarity.COMMON,
    'Vodka con ginger beer y lima servido en jarra de cobre.',
    'Vodka, ginger beer, lima',
    { baseAlcohol: 'Vodka' },
  ),
  drink(
    5,
    'Manhattan',
    'cocktails',
    DrinkRarity.RARE,
    'Elegante mezcla de whiskey, vermut dulce y bitter.',
    'Whiskey rye, vermut dulce, Angostura',
    { baseAlcohol: 'Whiskey' },
  ),
  drink(
    6,
    'Negroni',
    'cocktails',
    DrinkRarity.RARE,
    'Amargo italiano equilibrado: gin, Campari y vermut rosso.',
    'Gin, Campari, vermut rosso',
    { baseAlcohol: 'Gin' },
  ),
  drink(
    7,
    'Old Fashioned',
    'cocktails',
    DrinkRarity.RARE,
    'Cóctel atemporal de bourbon, azúcar y bitter sobre hielo.',
    'Bourbon, azúcar, Angostura, twist de naranja',
    { baseAlcohol: 'Whiskey' },
  ),
  drink(
    8,
    'Espresso Martini',
    'cocktails',
    DrinkRarity.EPIC,
    'Mixología moderna: vodka, licor de café y espresso recién hecho.',
    'Vodka, Kahlúa, espresso, jarabe simple',
    { baseAlcohol: 'Vodka' },
  ),
  drink(
    9,
    'Cosmopolitan',
    'cocktails',
    DrinkRarity.RARE,
    'Vodka con arándano, triple sec y lima, estilo cosmopolita.',
    'Vodka cítrico, Cointreau, jugo de arándano, lima',
    { baseAlcohol: 'Vodka' },
  ),
  drink(
    10,
    'Bloody Mary',
    'cocktails',
    DrinkRarity.COMMON,
    'Brunch clásico: vodka con tomate, especias y limón.',
    'Vodka, jugo de tomate, limón, Worcestershire, especias',
    { baseAlcohol: 'Vodka' },
  ),
  drink(
    11,
    'Daiquiri',
    'cocktails',
    DrinkRarity.COMMON,
    'Tres ingredientes perfectos: ron, lima y azúcar.',
    'Ron blanco, jugo de lima, jarabe simple',
    { baseAlcohol: 'Rum' },
  ),
  drink(
    12,
    'Michelada',
    'cocktails',
    DrinkRarity.COMMON,
    'Cerveza con lima, sal, salsa y chile — favorita en México.',
    'Cerveza lager, lima, sal, salsa, chile en polvo',
  ),

  // Beer
  drink(13, 'IPA Beer', 'beer', DrinkRarity.COMMON, 'India Pale Ale lupulada y aromática.', 'Cerveza IPA artesanal'),
  drink(14, 'Craft Lager', 'beer', DrinkRarity.COMMON, 'Lager limpia, maltosa y fácil de beber.', 'Cerveza lager'),
  drink(15, 'Imperial Stout', 'beer', DrinkRarity.RARE, 'Stout oscura con notas a café y chocolate.', 'Cerveza stout'),
  drink(16, 'Wheat Beer', 'beer', DrinkRarity.COMMON, 'Cerveza de trigo suave con notas cítricas.', 'Cerveza de trigo'),
  drink(17, 'Pilsner', 'beer', DrinkRarity.COMMON, 'Estilo checo, crisper y dorada.', 'Cerveza pilsner'),

  // Wine
  drink(
    18,
    'Cabernet Sauvignon',
    'wine',
    DrinkRarity.COMMON,
    'Tinto robusto con taninos firmes y frutos negros.',
    'Vino tinto Cabernet Sauvignon',
  ),
  drink(19, 'Pinot Noir', 'wine', DrinkRarity.RARE, 'Tinto elegante, sedoso, con cereza y tierra.', 'Vino tinto Pinot Noir'),
  drink(20, 'Rosé', 'wine', DrinkRarity.COMMON, 'Rosado seco y refrescante para cualquier ocasión.', 'Vino rosado'),
  drink(21, 'Prosecco', 'wine', DrinkRarity.RARE, 'Espumoso italiano ligero y burbujeante.', 'Vino espumoso Prosecco'),
  drink(22, 'Chardonnay', 'wine', DrinkRarity.COMMON, 'Blanco con cuerpo, manzana y mantequilla.', 'Vino blanco Chardonnay'),

  // Whiskey
  drink(
    23,
    'Whiskey Sour',
    'whiskey',
    DrinkRarity.RARE,
    'Whiskey con limón y jarabe, opcional clara de huevo.',
    'Whiskey bourbon, limón, jarabe simple, clara de huevo',
    { baseAlcohol: 'Whiskey' },
  ),
  drink(
    24,
    'Boulevardier',
    'whiskey',
    DrinkRarity.EPIC,
    'Primo del Negroni con bourbon en lugar de gin.',
    'Bourbon, Campari, vermut rosso',
    { baseAlcohol: 'Whiskey' },
  ),
  drink(
    25,
    'Rusty Nail',
    'whiskey',
    DrinkRarity.RARE,
    'Scotch con Drambuie, dulce y ahumado.',
    'Scotch, Drambuie',
    { baseAlcohol: 'Whiskey' },
  ),
  drink(
    26,
    'Bourbon on the Rocks',
    'whiskey',
    DrinkRarity.COMMON,
    'Bourbon servido solo sobre hielo para apreciar su carácter.',
    'Bourbon',
    { baseAlcohol: 'Whiskey' },
  ),
  drink(
    27,
    'Sazerac',
    'whiskey',
    DrinkRarity.LEGENDARY,
    'Ícono de Nueva Orleans: rye, absenta y Peychaud\'s.',
    'Rye whiskey, absenta, Peychaud\'s, azúcar',
    { baseAlcohol: 'Whiskey' },
  ),

  // Tequila
  drink(
    28,
    'Paloma',
    'tequila',
    DrinkRarity.COMMON,
    'Tequila con toronja y soda, más popular que la margarita en México.',
    'Tequila blanco, jugo de toronja, soda, sal',
    { baseAlcohol: 'Tequila', isPalomaFamily: true },
  ),
  drink(
    29,
    'Tequila Sunrise',
    'tequila',
    DrinkRarity.COMMON,
    'Tequila con naranja y granadina en degradado tropical.',
    'Tequila, jugo de naranja, granadina',
    { baseAlcohol: 'Tequila' },
  ),
  drink(
    30,
    'Cantarito',
    'tequila',
    DrinkRarity.RARE,
    'Jarrito de tequila con cítricos, sal y soda estilo Jalisco.',
    'Tequila, limón, naranja, toronja, sal, soda',
    { baseAlcohol: 'Tequila' },
  ),
  drink(
    31,
    "Tommy's Margarita",
    'tequila',
    DrinkRarity.RARE,
    'Margarita purista: tequila, lima y agave sin triple sec.',
    'Tequila reposado, lima, agave',
    { baseAlcohol: 'Tequila' },
  ),
  drink(
    32,
    'Añejo Tequila',
    'tequila',
    DrinkRarity.LEGENDARY,
    'Tequila añejado premium para degustar solo o en rocas.',
    'Tequila añejo',
    { baseAlcohol: 'Tequila' },
  ),

  // Vodka
  drink(
    33,
    'Martini',
    'vodka',
    DrinkRarity.LEGENDARY,
    'El cóctel más icónico: vodka o gin con vermut seco.',
    'Vodka, vermut seco, aceituna o twist de limón',
    { baseAlcohol: 'Vodka' },
  ),
  drink(
    34,
    'Lemon Drop',
    'vodka',
    DrinkRarity.COMMON,
    'Vodka cítrico dulce con azúcar en el borde.',
    'Vodka, triple sec, limón, azúcar',
    { baseAlcohol: 'Vodka' },
  ),
  drink(
    35,
    'White Russian',
    'vodka',
    DrinkRarity.COMMON,
    'Vodka con Kahlúa y crema, cremoso y indulgente.',
    'Vodka, Kahlúa, crema',
    { baseAlcohol: 'Vodka' },
  ),
  drink(
    36,
    'Vodka Tonic',
    'vodka',
    DrinkRarity.COMMON,
    'Simple y refrescante: vodka con agua tónica y lima.',
    'Vodka, agua tónica, lima',
    { baseAlcohol: 'Vodka' },
  ),
  drink(
    37,
    'Black Russian',
    'vodka',
    DrinkRarity.RARE,
    'Vodka con Kahlúa sin crema, intenso y directo.',
    'Vodka, Kahlúa',
    { baseAlcohol: 'Vodka' },
  ),

  // Gin
  drink(
    38,
    'Gin & Tonic',
    'gin',
    DrinkRarity.COMMON,
    'Gin con tónica, lima y botánicos aromáticos.',
    'Gin, agua tónica, lima',
    { baseAlcohol: 'Gin' },
  ),
  drink(
    39,
    'Tom Collins',
    'gin',
    DrinkRarity.COMMON,
    'Gin alargado con limón, azúcar y soda en copa alta.',
    'Gin, limón, jarabe simple, soda',
    { baseAlcohol: 'Gin' },
  ),
  drink(
    40,
    'Aviation',
    'gin',
    DrinkRarity.EPIC,
    'Gin clásico con maraschino, crème de violette y lima.',
    'Gin, maraschino, crème de violette, lima',
    { baseAlcohol: 'Gin' },
  ),
  drink(
    41,
    'Last Word',
    'gin',
    DrinkRarity.EPIC,
    'Proporciones iguales de gin, chartreuse, maraschino y lima.',
    'Gin, Green Chartreuse, maraschino, lima',
    { baseAlcohol: 'Gin' },
  ),
  drink(
    42,
    'Vesper Martini',
    'gin',
    DrinkRarity.LEGENDARY,
    'Martini de James Bond: gin, vodka y Lillet.',
    'Gin, vodka, Lillet Blanc, twist de limón',
    { baseAlcohol: 'Gin' },
  ),

  // Rum
  drink(
    43,
    "Dark 'n' Stormy",
    'rum',
    DrinkRarity.RARE,
    'Ron oscuro con ginger beer, bebida nacional de Bermudas.',
    'Ron oscuro, ginger beer, lima',
    { baseAlcohol: 'Rum' },
  ),
  drink(
    44,
    'Mai Tai',
    'rum',
    DrinkRarity.RARE,
    'Tiki legendario con ron, orgeat, curaçao y lima.',
    'Ron añejo, ron blanco, orgeat, curaçao, lima',
    { baseAlcohol: 'Rum' },
  ),
  drink(
    45,
    'Hurricane',
    'rum',
    DrinkRarity.EPIC,
    'Cóctel tiki de Nueva Orleans, frutas y dos rones.',
    'Ron blanco, ron oscuro, pasión, lima, granadina',
    { baseAlcohol: 'Rum' },
  ),
  drink(
    46,
    'Zombie',
    'rum',
    DrinkRarity.LEGENDARY,
    'Tiki potente de Don the Beachcomber con múltiples rones.',
    'Varios rones, falernum, Donn\'s mix, absenta',
    { baseAlcohol: 'Rum' },
  ),
  drink(
    47,
    "Planter's Punch",
    'rum',
    DrinkRarity.RARE,
    'Ron con cítricos, especias y un toque de amargo.',
    'Ron, lima, limón, granadina, Angostura',
    { baseAlcohol: 'Rum' },
  ),

  // Mezcal
  drink(
    48,
    'Mezcal Mule',
    'mezcal',
    DrinkRarity.RARE,
    'Variante ahumada del mule con mezcal artesanal.',
    'Mezcal, ginger beer, lima',
    { baseAlcohol: 'Mezcal', containsMezcal: true },
  ),
  drink(
    49,
    'Mezcal Negroni',
    'mezcal',
    DrinkRarity.EPIC,
    'Negroni con mezcal en lugar de gin, ahumado y complejo.',
    'Mezcal, Campari, vermut rosso',
    { baseAlcohol: 'Mezcal', containsMezcal: true },
  ),
  drink(
    50,
    'Oaxaca Old Fashioned',
    'mezcal',
    DrinkRarity.LEGENDARY,
    'Old Fashioned premium con mezcal y tequila reposado.',
    'Mezcal, tequila reposado, agave, Angostura',
    { baseAlcohol: 'Mezcal', containsMezcal: true },
  ),
  drink(
    51,
    'Mezcalita',
    'mezcal',
    DrinkRarity.COMMON,
    'Margarita ahumada con mezcal y lima fresca.',
    'Mezcal, lima, agave, sal',
    { baseAlcohol: 'Mezcal', containsMezcal: true },
  ),

  // Non Alcoholic
  drink(
    52,
    'Virgin Mojito',
    'non-alcoholic',
    DrinkRarity.COMMON,
    'Mojito sin alcohol con menta, lima y soda.',
    'Menta, lima, azúcar, soda',
  ),
  drink(
    53,
    'Shirley Temple',
    'non-alcoholic',
    DrinkRarity.COMMON,
    'Refresco clásico de jengibre con granadina y cereza.',
    'Ginger ale, granadina, cereza marrasquino',
  ),
  drink(
    54,
    'Arnold Palmer',
    'non-alcoholic',
    DrinkRarity.COMMON,
    'Mezcla refrescante de té helado y limonada.',
    'Té helado, limonada',
  ),
  drink(
    55,
    'Passion Fruit Cooler',
    'non-alcoholic',
    DrinkRarity.RARE,
    'Mocktail tropical de maracuyá, lima y soda.',
    'Puré de maracuyá, lima, jarabe, soda',
  ),
];

/** @deprecated Use DEMO_DRINKS — kept for imports that expect CATALOG_DRINKS */
export const CATALOG_DRINKS = DEMO_DRINKS;
