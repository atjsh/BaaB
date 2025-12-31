export function expectExists<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) {
    throw new Error(message ?? 'Expected value to be defined, but received null or undefined.');
  }
  return value;
}

/**
 * Throws an error if the specified property does not exist on the given object.
 * Also ensures that the property is not null or undefined.
 */
export function expectPropertyExists<T, K extends keyof T>(obj: T, key: K): NonNullable<T[K]> {
  const value = obj[key];
  if (value === null || value === undefined) {
    throw new Error(`Expected property '${String(key)}' to be defined, but received null or undefined.`);
  }
  return value as NonNullable<T[K]>;
}
