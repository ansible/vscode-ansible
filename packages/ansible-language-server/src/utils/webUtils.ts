// partially duplicated from ./src/features/lightspeed/utils/webUtils.ts
/* Get base uri in a correct formatted way */
export function getBaseUri(URL: string): string {
  const baseUri = URL.trim();
  return baseUri.endsWith("/") ? baseUri.slice(0, -1) : baseUri;
}
