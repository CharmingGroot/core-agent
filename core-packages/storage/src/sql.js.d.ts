declare module 'sql.js' {
  interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  interface Database {
    run(sql: string, params?: unknown[]): Database;
    exec(sql: string, params?: unknown[]): QueryExecResult[];
    export(): Uint8Array;
    close(): void;
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  export type { Database, QueryExecResult };

  export default function initSqlJs(): Promise<SqlJsStatic>;
}
