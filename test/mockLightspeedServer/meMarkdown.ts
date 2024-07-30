import { options } from "./server";
export function meMarkdown() {
  let content =
    "Logged in as: ONE_CLICK_USER (unlicensed)\n\n User Type: Unlicensed";
  if (options.meUppercase) {
    content = content.toUpperCase();
  }
  return { content };
}
