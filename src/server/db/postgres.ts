import pg from 'pg';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
const { Pool: PgPool } = pg;

declare global {
  var _courtSyncPgPool: Pool | undefined;
}

/**
 * Checks whether PostgreSQL environment credentials are configured.
 * Supports standard PG* environment variables or DATABASE_URL.
 */
export function isPostgresConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL ||
      (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE)
  );
}

/**
 * Returns a lazy singleton PostgreSQL connection pool.
 * Never opens eager startup connections at module load time.
 */
export function getPgPool(): Pool {
  if (!global._courtSyncPgPool) {
    global._courtSyncPgPool = process.env.DATABASE_URL
      ? new PgPool({
          connectionString: process.env.DATABASE_URL,
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
          ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
        })
      : new PgPool({
          host: process.env.PGHOST || '127.0.0.1',
          port: Number(process.env.PGPORT || 5432),
          user: process.env.PGUSER || 'postgres',
          password: process.env.PGPASSWORD || '',
          database: process.env.PGDATABASE || 'courtsync',
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
        });

    global._courtSyncPgPool.on('error', (err) => {
      console.error('[CourtSync PG Pool] Idle client error:', err.message);
    });
  }
  return global._courtSyncPgPool;
}

export async function queryPg<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const pool = getPgPool();
  return pool.query<T>(text, params);
}

/**
 * Executes a callback inside an atomic PostgreSQL transaction (BEGIN / COMMIT / ROLLBACK).
 * Used by POST /api/bookings to guarantee anti-double-booking via UNIQUE(court_id, booking_date, slot_hour).
 */
export async function withPgTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
