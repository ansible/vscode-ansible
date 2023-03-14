export function getCurrentUTCDateTime(): Date {
  const date = new Date();
  const utcString = date.toUTCString();
  const utcTimeStamp = new Date(utcString);
  return utcTimeStamp;
}
