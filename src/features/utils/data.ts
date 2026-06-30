export function compareObjects(
  baseObject: unknown,
  newObject: unknown,
): boolean {
  if (!isObject(baseObject) || !isObject(newObject)) {
    return false;
  }
  // compare the number of keys
  const baseObjectKeys = Object.keys(baseObject as object);
  const newObjectKeys = Object.keys(newObject as object);

  if (baseObjectKeys.length !== newObjectKeys.length) {
    return false;
  }

  // compare the values for each key
  const baseRecord = baseObject as Record<string, unknown>;
  const newRecord = newObject as Record<string, unknown>;
  for (const key of baseObjectKeys) {
    if (baseRecord[key] !== newRecord[key]) {
      return false;
    }
  }

  // all keys and values are equal
  return true;
}

function isObject(object: unknown): boolean {
  return object != null && typeof object === "object";
}

export function getValueFromObject(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
