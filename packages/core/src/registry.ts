import { RegistryError } from './errors/base-error.js';

export class Registry<T> {
  private readonly items = new Map<string, T>();
  private readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  register(name: string, item: T): void {
    if (this.items.has(name)) {
      throw new RegistryError(
        `${this.label} '${name}' is already registered`
      );
    }
    this.items.set(name, item);
  }

  get(name: string): T {
    const item = this.items.get(name);
    if (item === undefined) {
      throw new RegistryError(
        `${this.label} '${name}' is not registered`
      );
    }
    return item;
  }

  tryGet(name: string): T | undefined {
    return this.items.get(name);
  }

  has(name: string): boolean {
    return this.items.has(name);
  }

  getAll(): ReadonlyMap<string, T> {
    return this.items;
  }

  getAllNames(): readonly string[] {
    return [...this.items.keys()];
  }

  unregister(name: string): boolean {
    if (!this.items.has(name)) {
      throw new RegistryError(
        `${this.label} '${name}' is not registered`
      );
    }
    return this.items.delete(name);
  }

  clear(): void {
    this.items.clear();
  }

  get size(): number {
    return this.items.size;
  }
}
