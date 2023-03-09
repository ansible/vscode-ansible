export function getCurrentUTCDateTime(): Date {
  const date = new Date();
  const utcString = date.toUTCString();
  const gmtTimestamp = new Date(utcString);
  return gmtTimestamp;
}
