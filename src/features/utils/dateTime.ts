export function getCurrentUTCDateTime(): string {
  const date = new Date();
  const utcString = date.toUTCString();
  const gmtTimestamp = new Date(utcString).toISOString();
  return gmtTimestamp;
}
