/**
 * Checks READ-ONLY Medallas de Locales v2.
 *
 * Modes:
 *   PREFLIGHT  — before migrate deploy (missing tables/cols = NOT_APPLICABLE_PRE_MIGRATION)
 *   POSTCHECK  — after migrate deploy (missing schema = blocker)
 *
 * Env:
 *   DATABASE_URL   (required; Render injects Internal URL — never print it)
 *   BAR_MEDAL_CHECK_MODE=preflight|postcheck
 *   RENDER / RENDER_SERVICE_ID — set by Render; allows internal host
 *
 * Exit: 0 PASS | 1 blocker/error | 2 bad config
 */
import { PrismaClient } from '@prisma/client';

const MEDAL_MIGRATIONS = [
  '20261006120000_fase2_bar_mission_medal_versions',
  '20261006130000_fase3_bar_medal_review_metadata',
  '20261006140000_fase4_one_active_medal_per_season',
  '20261006150000_fase6_notification_dedupe_key',
  '20261006160000_fase7_medal_stats_indexes',
];

const MODE = (process.env.BAR_MEDAL_CHECK_MODE || 'preflight').toLowerCase();
const IS_POST = MODE === 'postcheck';
const TAG = IS_POST ? 'postcheck' : 'preflight';

function parseDbMeta(raw) {
  const normalized = raw.replace(/^postgresql:/i, 'http:').replace(/^postgres:/i, 'http:');
  const u = new URL(normalized);
  return {
    host: u.hostname,
    port: u.port || '5432',
    database: decodeURIComponent(u.pathname.replace(/^\//, '').split('?')[0] || ''),
  };
}

function isLocalHost(host) {
  const h = (host || '').toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '0.0.0.0' ||
    h === 'postgres' ||
    h.endsWith('.local')
  );
}

function onRender() {
  return Boolean(
    process.env.RENDER === 'true' ||
      process.env.RENDER_SERVICE_ID ||
      process.env.RENDER_INSTANCE_ID ||
      process.env.IS_PULL_REQUEST,
  );
}

async function tableExists(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    table,
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    table,
    column,
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function indexExists(prisma, indexName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1 LIMIT 1`,
    indexName,
  );
  return Array.isArray(rows) && rows.length > 0;
}

function section(title) {
  console.log(`\n=== [${TAG}] ${title} ===`);
}

function na(msg) {
  console.log(`  NOT_APPLICABLE_PRE_MIGRATION — ${msg}`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`[${TAG}] DATABASE_URL no definida.`);
    process.exit(2);
  }

  let meta;
  try {
    meta = parseDbMeta(url);
  } catch {
    console.error(`[${TAG}] DATABASE_URL inválida.`);
    process.exit(2);
  }

  // Never print credentials. Host/port/db only.
  console.log(`[${TAG}] Medallas de Locales v2 — READ-ONLY mode=${MODE}`);
  console.log(`[${TAG}] host=${meta.host}`);
  console.log(`[${TAG}] port=${meta.port}`);
  console.log(`[${TAG}] database=${meta.database}`);

  // On Render, DATABASE_URL is Internal (drinkquest-db). Localhost is never the target.
  if (isLocalHost(meta.host) && !onRender()) {
    console.error(
      `[${TAG}] RECHAZADO: host local. Este check debe correr en Render (render-bootstrap) con DATABASE_URL interna.`,
    );
    process.exit(2);
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  /** @type {{ code: string, severity: 'blocker'|'warn', message: string }[]} */
  const findings = [];

  const requireSchema = (ok, code, message) => {
    if (ok) return true;
    if (IS_POST) {
      findings.push({ code, severity: 'blocker', message });
      console.log(`  BLOCKER ${code}: ${message}`);
      return false;
    }
    na(message);
    return false;
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`[${TAG}] CONNECTED`);

    section('Migraciones medal-related');
    let appliedNames = new Set();
    try {
      const applied = await prisma.$queryRawUnsafe(
        `SELECT migration_name, finished_at, rolled_back_at
         FROM "_prisma_migrations"
         WHERE migration_name = ANY($1::text[])
         ORDER BY migration_name`,
        MEDAL_MIGRATIONS,
      );
      appliedNames = new Set(
        (applied || [])
          .filter((r) => r.finished_at && !r.rolled_back_at)
          .map((r) => r.migration_name),
      );
      for (const name of MEDAL_MIGRATIONS) {
        console.log(`  ${appliedNames.has(name) ? 'APPLIED' : 'PENDING'}  ${name}`);
      }
      if (IS_POST) {
        const missing = MEDAL_MIGRATIONS.filter((n) => !appliedNames.has(n));
        if (missing.length) {
          findings.push({
            code: 'MIGRATIONS_PENDING',
            severity: 'blocker',
            message: `Migraciones medal pendientes tras deploy: ${missing.join(', ')}`,
          });
        }
      }
    } catch (e) {
      findings.push({
        code: 'MIGRATIONS_TABLE',
        severity: 'blocker',
        message: `_prisma_migrations inaccesible: ${e?.message ?? e}`,
      });
    }

    const versionsTable = await tableExists(prisma, 'bar_mission_medal_versions');
    const conditionsTable = await tableExists(prisma, 'bar_mission_medal_conditions');
    const seasonsTable = await tableExists(prisma, 'bar_mission_seasons');
    const unlocksTable = await tableExists(prisma, 'user_bar_medals');
    const notificationsTable = await tableExists(prisma, 'notifications');
    const rewardsTable = await tableExists(prisma, 'gamification_rewards');
    const hasMedalVersionCol =
      unlocksTable && (await columnExists(prisma, 'user_bar_medals', 'medal_version_id'));
    const hasCurrentCol =
      seasonsTable &&
      (await columnExists(prisma, 'bar_mission_seasons', 'current_medal_version_id'));
    const hasDedupeCol =
      notificationsTable &&
      (await columnExists(prisma, 'notifications', 'dedupe_key'));
    const hasSubmittedBy =
      versionsTable &&
      (await columnExists(prisma, 'bar_mission_medal_versions', 'submitted_by_user_id'));

    section('Schema presence');
    requireSchema(versionsTable, 'MISSING_VERSIONS_TABLE', 'falta bar_mission_medal_versions');
    requireSchema(conditionsTable, 'MISSING_CONDITIONS_TABLE', 'falta bar_mission_medal_conditions');
    requireSchema(hasMedalVersionCol, 'MISSING_MEDAL_VERSION_ID', 'falta user_bar_medals.medal_version_id');
    requireSchema(hasCurrentCol, 'MISSING_CURRENT_VERSION_ID', 'falta current_medal_version_id');
    requireSchema(hasSubmittedBy, 'MISSING_SUBMITTED_BY', 'falta submitted_by_user_id (FASE3)');
    requireSchema(hasDedupeCol, 'MISSING_DEDUPE_KEY', 'falta notifications.dedupe_key (FASE6)');

    section('ACTIVE unique / duplicados');
    if (!versionsTable) {
      na('tabla versiones aún no existe');
    } else {
      const dupActive = await prisma.$queryRawUnsafe(`
        SELECT season_id::text AS "seasonId", COUNT(*)::int AS qty
        FROM bar_mission_medal_versions
        WHERE status = 'ACTIVE'
        GROUP BY season_id
        HAVING COUNT(*) > 1
        LIMIT 50
      `);
      if (dupActive.length === 0) console.log('  OK — 0 seasons con >1 ACTIVE');
      else {
        findings.push({
          code: 'DUP_ACTIVE',
          severity: 'blocker',
          message: `${dupActive.length} season(s) con >1 ACTIVE`,
        });
        for (const row of dupActive) {
          console.log(`  BLOCKER seasonId=${row.seasonId} qty=${row.qty}`);
        }
      }
      const hasPartial = await indexExists(
        prisma,
        'bar_mission_medal_versions_one_active_per_season_idx',
      );
      if (hasPartial) console.log('  OK — índice parcial one_active_per_season');
      else if (IS_POST) {
        findings.push({
          code: 'MISSING_ACTIVE_PARTIAL_INDEX',
          severity: 'blocker',
          message: 'falta índice parcial one_active_per_season (FASE4)',
        });
      } else na('índice parcial se crea en FASE4');
    }

    section('UserBarMedal userId+seasonId');
    if (!unlocksTable) {
      na('user_bar_medals ausente');
    } else {
      const dupUnlock = await prisma.$queryRawUnsafe(`
        SELECT user_id::text AS "userId", season_id::text AS "seasonId", COUNT(*)::int AS qty
        FROM user_bar_medals
        GROUP BY user_id, season_id
        HAVING COUNT(*) > 1
        LIMIT 50
      `);
      if (dupUnlock.length === 0) console.log('  OK — 0 duplicados');
      else {
        findings.push({
          code: 'DUP_USER_SEASON',
          severity: 'blocker',
          message: `${dupUnlock.length} pares user+season duplicados`,
        });
      }
    }

    section('Backfill / legacy coherence');
    if (!seasonsTable) {
      na('bar_mission_seasons ausente');
    } else if (!versionsTable) {
      na('versiones aún no creadas; backfill corre en FASE2 migrate');
    } else {
      const missingVersion = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS qty
        FROM bar_mission_seasons s
        WHERE s.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM bar_mission_medal_versions v WHERE v.season_id = s.id
          )
      `);
      const mv = missingVersion[0]?.qty ?? 0;
      if (mv === 0) console.log('  OK — seasons tienen versión');
      else {
        findings.push({
          code: 'SEASON_WITHOUT_VERSION',
          severity: 'blocker',
          message: `${mv} seasons sin BarMissionMedalVersion`,
        });
      }

      if (hasMedalVersionCol) {
        const nullVersionUnlocks = await prisma.$queryRawUnsafe(`
          SELECT COUNT(*)::int AS qty FROM user_bar_medals WHERE medal_version_id IS NULL
        `);
        const nullQty = nullVersionUnlocks[0]?.qty ?? 0;
        if (nullQty === 0) console.log('  OK — 0 unlocks con medal_version_id NULL');
        else {
          findings.push({
            code: 'UNLOCK_NULL_VERSION',
            severity: 'blocker',
            message: `${nullQty} UserBarMedal con medal_version_id NULL`,
          });
        }
      }

      if (conditionsTable) {
        const condCount = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*)::int AS qty FROM bar_mission_medal_conditions`,
        );
        console.log(`  conditions total=${condCount[0]?.qty ?? 0}`);
      }

      // Legacy preservation smoke (counts only)
      const legacy = await prisma.$queryRawUnsafe(`
        SELECT
          (SELECT COUNT(*)::int FROM bar_mission_seasons WHERE deleted_at IS NULL) AS seasons,
          (SELECT COUNT(*)::int FROM bar_missions) AS missions,
          (SELECT COUNT(*)::int FROM user_bar_medals) AS unlocks
      `);
      console.log(
        `  legacy counts seasons=${legacy[0]?.seasons} missions=${legacy[0]?.missions} unlocks=${legacy[0]?.unlocks}`,
      );
    }

    section('FK integrity');
    if (versionsTable && unlocksTable && hasMedalVersionCol) {
      const orphanUnlock = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS qty FROM user_bar_medals u
        WHERE u.medal_version_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM bar_mission_medal_versions v WHERE v.id = u.medal_version_id
          )
      `);
      const o = orphanUnlock[0]?.qty ?? 0;
      if (o === 0) console.log('  OK — unlocks → versiones');
      else {
        findings.push({
          code: 'ORPHAN_UNLOCK_VERSION',
          severity: 'blocker',
          message: `${o} unlocks con versión inexistente`,
        });
      }

      const wrongSeason = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS qty
        FROM user_bar_medals u
        JOIN bar_mission_medal_versions v ON v.id = u.medal_version_id
        WHERE v.season_id <> u.season_id
      `);
      const ws = wrongSeason[0]?.qty ?? 0;
      if (ws === 0) console.log('  OK — season de versión = season de unlock');
      else {
        findings.push({
          code: 'UNLOCK_VERSION_SEASON_MISMATCH',
          severity: 'blocker',
          message: `${ws} unlocks con season distinta a su versión`,
        });
      }
    } else if (!IS_POST) {
      na('FK medal_version aún no aplicables');
    }

    if (seasonsTable && versionsTable && hasCurrentCol) {
      const badCurrent = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS qty FROM bar_mission_seasons s
        WHERE s.current_medal_version_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM bar_mission_medal_versions v
            WHERE v.id = s.current_medal_version_id
          )
      `);
      const bc = badCurrent[0]?.qty ?? 0;
      if (bc === 0) console.log('  OK — current_medal_version_id');
      else {
        findings.push({
          code: 'INVALID_CURRENT_VERSION',
          severity: 'blocker',
          message: `${bc} seasons con current inválido`,
        });
      }
    }

    section('Notification.dedupe_key');
    if (!notificationsTable) na('notifications ausente');
    else if (!hasDedupeCol) {
      if (IS_POST) {
        findings.push({
          code: 'MISSING_DEDUPE_KEY',
          severity: 'blocker',
          message: 'dedupe_key ausente tras migrate',
        });
      } else na('columna se crea en FASE6');
    } else {
      const dupKeys = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS groups FROM (
          SELECT dedupe_key FROM notifications
          WHERE dedupe_key IS NOT NULL
          GROUP BY dedupe_key HAVING COUNT(*) > 1
        ) t
      `);
      const dg = dupKeys[0]?.groups ?? 0;
      if (dg === 0) console.log('  OK — 0 dedupe_key duplicados');
      else {
        findings.push({
          code: 'DUP_DEDUPE_KEY',
          severity: 'blocker',
          message: `${dg} dedupe_key duplicados (UNIQUE FASE6 fallaría/falló)`,
        });
      }
      const hasUnique = await indexExists(prisma, 'notifications_dedupe_key_key');
      if (hasUnique) console.log('  OK — UNIQUE notifications_dedupe_key_key');
      else if (IS_POST) {
        findings.push({
          code: 'MISSING_DEDUPE_UNIQUE',
          severity: 'blocker',
          message: 'falta UNIQUE index dedupe_key',
        });
      }
    }

    section('GamificationReward BAR_MEDAL_UNLOCK');
    if (!rewardsTable) na('gamification_rewards ausente');
    else {
      const dupRewards = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS groups FROM (
          SELECT user_id, source_id FROM gamification_rewards
          WHERE source_type = 'BAR_MEDAL_UNLOCK'
          GROUP BY user_id, source_id HAVING COUNT(*) > 1
        ) t
      `);
      const rg = dupRewards[0]?.groups ?? 0;
      if (rg === 0) console.log('  OK — 0 rewards BAR_MEDAL_UNLOCK duplicados');
      else {
        findings.push({
          code: 'DUP_BAR_MEDAL_REWARD',
          severity: 'blocker',
          message: `${rg} rewards BAR_MEDAL_UNLOCK duplicados`,
        });
      }
    }

    section('Stats indexes');
    const idxUnlocks = await indexExists(prisma, 'user_bar_medals_season_id_unlocked_at_idx');
    const idxVisits = await indexExists(prisma, 'place_visits_bar_id_visited_at_idx');
    if (idxUnlocks) console.log('  OK — user_bar_medals(season_id, unlocked_at)');
    else if (IS_POST) {
      findings.push({
        code: 'MISSING_STATS_INDEX_UNLOCKS',
        severity: 'blocker',
        message: 'falta índice stats unlocks (FASE7)',
      });
    } else na('índice unlocks se crea en FASE7');
    if (idxVisits) console.log('  OK — place_visits(bar_id, visited_at)');
    else if (IS_POST) {
      findings.push({
        code: 'MISSING_STATS_INDEX_VISITS',
        severity: 'blocker',
        message: 'falta índice stats visits (FASE7)',
      });
    } else na('índice visits se crea en FASE7');

    section('Resumen');
    const blockers = findings.filter((f) => f.severity === 'blocker');
    const warns = findings.filter((f) => f.severity === 'warn');
    console.log(`  blockers=${blockers.length} warnings=${warns.length}`);
    for (const f of findings) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.code}: ${f.message}`);
    }

    if (blockers.length > 0) {
      console.error(`\n[${TAG}] FAIL`);
      process.exit(1);
    }
    console.log(`\n[${TAG}] PASS`);
    process.exit(0);
  } catch (err) {
    console.error(`[${TAG}] ERROR:`, err?.message ?? err);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main();
