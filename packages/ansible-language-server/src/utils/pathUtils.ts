import { sync } from "glob";

/**
 * A glob utility function that that accepts array of patterns and also
 * excludes matching patterns that begin with '!' from the returned array
 * @param arrayOfPatterns - array of patterns
 * @returns matched files
 */
export function globArray(arrayOfPatterns: string[]): string[] {
  // Patterns to be matched
  const matchPatterns = arrayOfPatterns.filter(
    (pattern) => !pattern.startsWith("!"),
  );

  // Patterns to be excluded
  const ignorePatterns = arrayOfPatterns
    .filter((pattern) => pattern.startsWith("!"))
    .map((item) => item.slice(1));

  let matchFiles: string[] = [];
  matchPatterns.forEach((pattern) => {
    const matchedFiles = sync(pattern);
    matchFiles = matchFiles.concat(matchedFiles);
  });
  const matchFilesSet = new Set(matchFiles);

  if (ignorePatterns.length === 0) {
    return [...matchFilesSet];
  } else {
    let matchFilesAfterExclusion: string[] = [];
    matchPatterns.forEach((pattern) => {
      const ignoredFiles = sync(pattern, {
        ignore: ignorePatterns,
      });
      matchFilesAfterExclusion = matchFilesAfterExclusion.concat(ignoredFiles);
    });
    const matchFilesAfterExclusionSet = new Set(matchFilesAfterExclusion);
    return [...matchFilesAfterExclusionSet];
  }
}
