import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from '../src/registry.js';
import { RegistryError } from '../src/errors/base-error.js';

describe('Registry', () => {
  let registry: Registry<string>;

  beforeEach(() => {
    registry = new Registry<string>('TestItem');
  });

  it('should register and retrieve an item', () => {
    registry.register('foo', 'bar');
    expect(registry.get('foo')).toBe('bar');
  });

  it('should throw on duplicate registration', () => {
    registry.register('foo', 'bar');
    expect(() => registry.register('foo', 'baz')).toThrow(RegistryError);
    expect(() => registry.register('foo', 'baz')).toThrow(
      "TestItem 'foo' is already registered"
    );
  });

  it('should throw on get for unregistered item', () => {
    expect(() => registry.get('missing')).toThrow(RegistryError);
    expect(() => registry.get('missing')).toThrow(
      "TestItem 'missing' is not registered"
    );
  });

  it('should return undefined for tryGet on missing item', () => {
    expect(registry.tryGet('missing')).toBeUndefined();
  });

  it('should report has correctly', () => {
    registry.register('exists', 'value');
    expect(registry.has('exists')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('should return all items', () => {
    registry.register('a', '1');
    registry.register('b', '2');
    const all = registry.getAll();
    expect(all.size).toBe(2);
    expect(all.get('a')).toBe('1');
    expect(all.get('b')).toBe('2');
  });

  it('should return all names', () => {
    registry.register('x', '1');
    registry.register('y', '2');
    expect(registry.getAllNames()).toEqual(['x', 'y']);
  });

  it('should unregister an item', () => {
    registry.register('item', 'val');
    expect(registry.unregister('item')).toBe(true);
    expect(registry.has('item')).toBe(false);
  });

  it('should throw when unregistering non-existent item', () => {
    expect(() => registry.unregister('ghost')).toThrow(RegistryError);
  });

  it('should clear all items', () => {
    registry.register('a', '1');
    registry.register('b', '2');
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('should track size correctly', () => {
    expect(registry.size).toBe(0);
    registry.register('a', '1');
    expect(registry.size).toBe(1);
    registry.register('b', '2');
    expect(registry.size).toBe(2);
    registry.unregister('a');
    expect(registry.size).toBe(1);
  });

  it('should work with complex types', () => {
    const objRegistry = new Registry<{ id: number; name: string }>('Object');
    const item = { id: 1, name: 'test' };
    objRegistry.register('obj', item);
    expect(objRegistry.get('obj')).toBe(item);
  });
});
