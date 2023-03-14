// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compareObjects(baseObject: any, newObject: any): boolean {
  // compare the number of keys
  const baseObjectKeys = Object.keys(baseObject);
  const newObjectKeys = Object.keys(newObject);

  if (baseObjectKeys.length !== newObjectKeys.length) {
    return false;
  }

  // compare the values for each key
  for (const key of baseObjectKeys) {
    if (baseObject[key] !== newObject[key]) {
      return false;
    }
  }

  // all keys and values are equal
  return true;
}
