declare module "sql.js" {
  interface Database {
    exec(sql: string): QueryExecResult[];
    close(): void;
  }

  interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  function initSqlJs(): Promise<SqlJsStatic>;
  export default initSqlJs;
}
