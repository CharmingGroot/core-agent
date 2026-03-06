declare module 'pg' {
  export class Pool {
    constructor(config: Record<string, unknown>);
    query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    end(): Promise<void>;
  }
  export default { Pool };
}

declare module 'mysql2/promise' {
  export interface Connection {
    execute(sql: string, values?: readonly unknown[]): Promise<[Record<string, unknown>[], unknown]>;
    end(): Promise<void>;
  }
  export function createConnection(config: Record<string, unknown>): Promise<Connection>;
}

declare module 'mongodb' {
  export class MongoClient {
    constructor(uri: string);
    connect(): Promise<void>;
    close(): Promise<void>;
    db(name: string): Db;
  }
  export interface Db {
    collection(name: string): Collection;
  }
  export interface Collection {
    insertOne(doc: Record<string, unknown>): Promise<{ insertedId: unknown }>;
    findOne(filter: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    find(filter: Record<string, unknown>): FindCursor;
    updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ modifiedCount: number }>;
    deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
    countDocuments(filter?: Record<string, unknown>): Promise<number>;
  }
  export interface FindCursor {
    sort(sort: Record<string, number>): FindCursor;
    skip(n: number): FindCursor;
    limit(n: number): FindCursor;
    toArray(): Promise<Record<string, unknown>[]>;
  }
}
