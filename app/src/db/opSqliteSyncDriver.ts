/**
 * A synchronous Drizzle SQLite driver over op-sqlite, modeled directly on
 * `drizzle-orm/better-sqlite3`'s own `driver.ts`/`session.ts` (read those first if this file
 * is confusing — this is a line-for-line adaptation, not a novel design).
 *
 * Why this exists (see ADR 0004): `packages/store`'s `Db` type is
 * `BaseSQLiteDatabase<'sync', ...>` (ADR 0003 — one schema, drivers are "a constructor call").
 * That held for `drizzle-orm/better-sqlite3`, but the pinned `drizzle-orm@0.45.2`'s own
 * `drizzle-orm/op-sqlite` export is `BaseSQLiteDatabase<'async', ...>` — there is no shipped
 * *synchronous* Drizzle driver for op-sqlite. Rather than make every repository function in
 * `packages/store` async (a sweeping change to an already-verified, independently-tested
 * package, well outside this wave's "no business logic in the UI layer" mandate), this file
 * wraps op-sqlite's own synchronous primitive — `executeSync`/`executeRawSync` — in the same
 * `SQLiteSyncDialect` + `SQLiteSession` contract `better-sqlite3`'s driver satisfies. Once
 * built, the resulting `Db` handle is indistinguishable to `packages/store` from the
 * better-sqlite3 one the test harness uses — same schema, same query builder, same sync API.
 *
 * Only this file (and `index.ts`, which calls it) may import `@op-engineering/op-sqlite`,
 * per ADR 0003's "production wiring is a separate op-sqlite adapter in `app/src/db/`."
 *
 * Note on `dialect`/`session`: `drizzle-orm`'s own `.d.ts` for `SQLiteSession` and
 * `SQLiteTransaction` accepts `dialect`/`session` as plain constructor parameters, not typed
 * instance properties (its compiled JS assigns `this.dialect = dialect` itself, but that isn't
 * reflected in the public types) — so unlike the JS original this drives from, this file stores
 * its own explicit references rather than reading them back off `this`.
 */
import type { DB as OpSqliteDb } from '@op-engineering/op-sqlite';
import { Column } from 'drizzle-orm/column';
import { entityKind, is } from 'drizzle-orm/entity';
import { DefaultLogger, NoopLogger } from 'drizzle-orm/logger';
import type { Logger } from 'drizzle-orm/logger';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from 'drizzle-orm/relations';
import type { RelationalSchemaConfig, TablesRelationalConfig } from 'drizzle-orm/relations';
import { fillPlaceholders, SQL } from 'drizzle-orm/sql/sql';
import type { Query } from 'drizzle-orm/sql/sql';
import { Subquery } from 'drizzle-orm/subquery';
import { getTableName } from 'drizzle-orm/table';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core/db';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core/dialect';
import {
  SQLitePreparedQuery as PreparedQueryBase,
  SQLiteSession,
  SQLiteTransaction,
} from 'drizzle-orm/sqlite-core/session';
import type {
  PreparedQueryConfig,
  SQLiteExecuteMethod,
  SQLiteTransactionConfig,
} from 'drizzle-orm/sqlite-core/session';
import type { SelectedFieldsOrdered } from 'drizzle-orm/sqlite-core/query-builders/select.types';
import type { DrizzleConfig } from 'drizzle-orm/utils';

export interface OpSqliteRunResult {
  rowsAffected: number;
  insertId?: number;
}

// --------------------------------------------------------------------------------------------
// mapResultRow — `drizzle-orm/utils`'s own version of this is not part of the package's public
// API surface (no exported type, `drizzle-orm/utils.d.ts` doesn't list it), even though every
// first-party sync/async driver in `drizzle-orm` relies on it internally. Reimplemented here
// against only public exports (`is`, `Column`, `SQL`, `Subquery`, `getTableName`), faithful to
// the upstream implementation for the case this app actually needs: single-table selects, no
// joins (`packages/store` uses neither `leftJoin`/`innerJoin` nor the relational `db.query`
// API anywhere — confirmed by grep before writing this). Join-nullability remapping
// (`joinsNotNullableMap`) is intentionally not reimplemented for the same reason.
// --------------------------------------------------------------------------------------------
type FieldEntry = { path: string[]; field: unknown };

function decoderFor(field: unknown): { mapFromDriverValue(v: unknown): unknown } {
  if (is(field, Column)) return field;
  if (is(field, SQL))
    return (field as SQL & { decoder: { mapFromDriverValue(v: unknown): unknown } }).decoder;
  if (is(field, Subquery)) {
    return (
      field as unknown as { _: { sql: { decoder: { mapFromDriverValue(v: unknown): unknown } } } }
    )._.sql.decoder;
  }
  return (field as { sql: { decoder: { mapFromDriverValue(v: unknown): unknown } } }).sql.decoder;
}

function mapResultRow(columns: FieldEntry[], row: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  columns.forEach(({ path, field }, columnIndex) => {
    const decoder = decoderFor(field);
    let node: Record<string, unknown> = result;
    path.forEach((pathChunk, i) => {
      if (i < path.length - 1) {
        if (!(pathChunk in node)) node[pathChunk] = {};
        node = node[pathChunk] as Record<string, unknown>;
      } else {
        const rawValue = row[columnIndex];
        node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
      }
    });
  });
  return result;
}
// Silence "declared but never used" for the join-metadata helper this file deliberately omits —
// kept as a doc pointer in case `packages/store` ever adds a join.
void getTableName;

// --------------------------------------------------------------------------------------------

// Mirrors `drizzle-orm/better-sqlite3`'s own `PreparedQuery<T>` declaration exactly: `type` is
// pinned to the literal `'sync'` (not the generic `T['type']`) so `Result<'sync', X>` resolves
// to plain `X` rather than the sync|async union — that's what makes `run`/`all`/`get`/`values`
// below type-check as returning their value directly instead of `ExecuteResultSync | Promise`.
class OpSqlitePreparedQuery<
  T extends PreparedQueryConfig = PreparedQueryConfig,
> extends PreparedQueryBase<{
  type: 'sync';
  run: OpSqliteRunResult;
  all: T['all'];
  get: T['get'];
  values: T['values'];
  execute: T['execute'];
}> {
  static readonly [entityKind] = 'OpSqlitePreparedQuery';

  constructor(
    private client: OpSqliteDb,
    query: Query,
    private logger: Logger,
    private fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    private _isResponseInArrayMode: boolean,
    private customResultMapper?: (rows: unknown[][]) => unknown,
  ) {
    super('sync', executeMethod, query);
  }

  run(placeholderValues?: Record<string, unknown>): OpSqliteRunResult {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    const result = this.client.executeSync(this.query.sql, params as never[]);
    return { rowsAffected: result.rowsAffected, insertId: result.insertId };
  }

  all(placeholderValues?: Record<string, unknown>): T['all'] {
    const { fields, query, logger, customResultMapper } = this;
    const params = fillPlaceholders(query.params, placeholderValues ?? {});
    logger.logQuery(query.sql, params);
    if (!fields && !customResultMapper) {
      return this.client.executeSync(query.sql, params as never[]).rows as T['all'];
    }
    const rows = this.values(placeholderValues) as unknown[][];
    if (customResultMapper) return customResultMapper(rows) as T['all'];
    return rows.map((row) => mapResultRow(fields as FieldEntry[], row)) as T['all'];
  }

  get(placeholderValues?: Record<string, unknown>): T['get'] {
    const { fields, query, logger, customResultMapper } = this;
    const params = fillPlaceholders(query.params, placeholderValues ?? {});
    logger.logQuery(query.sql, params);
    if (!fields && !customResultMapper) {
      return this.client.executeSync(query.sql, params as never[]).rows[0] as T['get'];
    }
    const rows = this.values(placeholderValues) as unknown[][];
    const row = rows[0];
    if (!row) return undefined as T['get'];
    if (customResultMapper) return customResultMapper([row]) as T['get'];
    return mapResultRow(fields as FieldEntry[], row) as T['get'];
  }

  values(placeholderValues?: Record<string, unknown>): T['values'] {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return this.client.executeRawSync(this.query.sql, params as never[]).rawRows as T['values'];
  }

  /** @internal */
  isResponseInArrayMode(): boolean {
    return this._isResponseInArrayMode;
  }
}

export class OpSqliteSession<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'sync', OpSqliteRunResult, TFullSchema, TSchema> {
  static readonly [entityKind] = 'OpSqliteSession';
  private logger: Logger;
  private savepointCounter = 0;
  private dialectRef: SQLiteSyncDialect;

  constructor(
    private client: OpSqliteDb,
    dialect: SQLiteSyncDialect,
    private schemaRef: RelationalSchemaConfig<TSchema> | undefined,
    options: { logger?: Logger } = {},
  ) {
    super(dialect);
    this.dialectRef = dialect;
    this.logger = options.logger ?? new NoopLogger();
  }

  prepareQuery(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    isResponseInArrayMode: boolean,
    customResultMapper?: (rows: unknown[][]) => unknown,
  ) {
    return new OpSqlitePreparedQuery(
      this.client,
      query,
      this.logger,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper,
    );
  }

  /** op-sqlite exposes no bare BEGIN/COMMIT wrapper on the sync surface, so every transaction —
   *  nested or not — is a SAVEPOINT. A top-level SAVEPOINT/RELEASE pair behaves like
   *  BEGIN/COMMIT when there is no outer transaction, which is the only case this app ever
   *  produces (packages/store never nests `db.transaction` calls). */
  transaction<T>(
    transaction: (tx: OpSqliteTransaction<TFullSchema, TSchema>) => T,
    _config?: SQLiteTransactionConfig,
  ): T {
    const savepointName = `sp${this.savepointCounter++}`;
    const tx = new OpSqliteTransaction(this.client, this.dialectRef, this, this.schemaRef);
    this.client.executeSync(`savepoint ${savepointName}`);
    try {
      const result = transaction(tx);
      this.client.executeSync(`release savepoint ${savepointName}`);
      return result;
    } catch (err) {
      this.client.executeSync(`rollback to savepoint ${savepointName}`);
      this.client.executeSync(`release savepoint ${savepointName}`);
      throw err;
    }
  }
}

export class OpSqliteTransaction<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'sync', OpSqliteRunResult, TFullSchema, TSchema> {
  static readonly [entityKind] = 'OpSqliteTransaction';

  constructor(
    private client: OpSqliteDb,
    private dialectRef: SQLiteSyncDialect,
    private sessionRef: SQLiteSession<'sync', OpSqliteRunResult, TFullSchema, TSchema>,
    schema: RelationalSchemaConfig<TSchema> | undefined,
    nestedIndex = 0,
  ) {
    super('sync', dialectRef, sessionRef, schema, nestedIndex);
  }

  transaction<T>(transaction: (tx: OpSqliteTransaction<TFullSchema, TSchema>) => T): T {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new OpSqliteTransaction(
      this.client,
      this.dialectRef,
      this.sessionRef,
      this.schema,
      this.nestedIndex + 1,
    );
    this.client.executeSync(`savepoint ${savepointName}`);
    try {
      const result = transaction(tx);
      this.client.executeSync(`release savepoint ${savepointName}`);
      return result;
    } catch (err) {
      this.client.executeSync(`rollback to savepoint ${savepointName}`);
      this.client.executeSync(`release savepoint ${savepointName}`);
      throw err;
    }
  }
}

export class OpSqliteDrizzleDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'sync', OpSqliteRunResult, TSchema> {
  static readonly [entityKind] = 'OpSqliteDrizzleDatabase';
}

/** Mirrors `drizzle-orm/better-sqlite3`'s `drizzle(client, config)` factory shape, so call sites
 *  read the same way regardless of which physical driver is behind them. */
export function drizzleOpSqlite<TSchema extends Record<string, unknown> = Record<string, never>>(
  client: OpSqliteDb,
  config: DrizzleConfig<TSchema> = {},
): OpSqliteDrizzleDatabase<TSchema> & { $client: OpSqliteDb } {
  const dialect = new SQLiteSyncDialect({ casing: config.casing });
  let logger: Logger | undefined;
  if (config.logger === true) logger = new DefaultLogger();
  else if (config.logger !== false) logger = config.logger;

  let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(config.schema, createTableRelationsHelpers);
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap,
    };
  }

  const session = new OpSqliteSession(client, dialect, schema, { logger });
  const db = new OpSqliteDrizzleDatabase(
    'sync',
    dialect,
    session,
    schema,
  ) as OpSqliteDrizzleDatabase<TSchema> & { $client: OpSqliteDb };
  db.$client = client;
  return db;
}
