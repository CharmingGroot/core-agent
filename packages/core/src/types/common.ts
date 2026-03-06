export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = Record<string, JsonValue>;

export interface Identifiable {
  readonly id: string;
}

export interface Timestamped {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Disposable {
  dispose(): Promise<void>;
}
