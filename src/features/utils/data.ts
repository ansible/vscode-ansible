// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compareObjects(obj1: any, obj2: any): boolean {
  // compare the number of keys
  const obj1Keys = Object.keys(obj1);
  const obj2Keys = Object.keys(obj2);

  if (obj1Keys.length !== obj2Keys.length) {
    return false;
  }

  // compare the values for each key
  for (const key of obj1Keys) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }

  // all keys and values are equal
  return true;
}
