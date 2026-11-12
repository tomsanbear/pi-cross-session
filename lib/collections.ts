type InsertionOrderedKeys<Key> = {
  readonly size: number;
  keys(): IterableIterator<Key>;
  delete(key: Key): boolean;
};

// Map and Set both preserve insertion order. Keep eviction explicit without
// asserting that an unchecked iterator result always contains a value.
export function trimOldest<Key>(collection: InsertionOrderedKeys<Key>, limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("Invalid collection limit");
  while (collection.size > limit) {
    const oldest = collection.keys().next();
    if (oldest.done) break;
    collection.delete(oldest.value);
  }
}
