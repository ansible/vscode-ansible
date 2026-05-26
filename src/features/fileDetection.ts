import * as yaml from "yaml";

const MODELINE_REGEX = /^.{0,8}code:(.*)/;
const MODELINE_OPT_REGEX = /(\w+)=([^\s]+)/g;
const NUM_LINES_TO_SEARCH = 5;
const MAX_LINE_LENGTH = 500;

const ANSIBLE_TOP_LEVEL_KEYS = [
  "hosts",
  "import_playbook",
  "ansible.builtin.import_playbook",
];

/**
 * Parse a VS Code-style modeline (e.g. `# code: language=ansible`) and return
 * the language value, or undefined if no valid language directive is found.
 */
export function parseModelineLanguage(line: string): string | undefined {
  const match = line.match(MODELINE_REGEX);
  if (!match) {
    return undefined;
  }

  const opts = match[1];
  let lang: string | undefined;
  let m: RegExpExecArray | null;
  // Reset lastIndex for the global regex before each use
  MODELINE_OPT_REGEX.lastIndex = 0;
  while ((m = MODELINE_OPT_REGEX.exec(opts))) {
    const name = m[1].toLowerCase();
    if (name === "language" || name === "lang") {
      lang = m[2].replace(/['"]/g, "").trim();
    }
  }
  return lang;
}

/**
 * Search the first and last N lines of a document for a modeline language
 * directive. Returns the language string if found, undefined otherwise.
 */
export function searchModelineLanguage(text: string): string | undefined {
  const lines = text.split(/\n/g);
  let checkNum = NUM_LINES_TO_SEARCH;
  if (lines.length < NUM_LINES_TO_SEARCH * 2) {
    checkNum = Math.floor(lines.length / 2);
  }

  const candidates = [
    ...lines.slice(0, checkNum),
    ...lines.slice(-checkNum),
  ].filter((l) => l.length <= MAX_LINE_LENGTH);

  for (const line of candidates) {
    const lang = parseModelineLanguage(line);
    if (lang) {
      return lang;
    }
  }
  return undefined;
}

/**
 * Inspect a YAML document's content to determine if it looks like an Ansible
 * playbook. Returns true when the top-level structure is an array and the
 * first element contains a recognized Ansible key (hosts, import_playbook, etc.).
 */
export function looksLikePlaybook(text: string): boolean {
  try {
    const parsed: unknown = yaml.parse(text);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return false;
    }

    const firstItem = parsed[0] as Record<string, unknown> | null;
    if (!firstItem || typeof firstItem !== "object") {
      return false;
    }

    const keys = Object.keys(firstItem);
    return ANSIBLE_TOP_LEVEL_KEYS.some((k) => keys.includes(k));
  } catch {
    return false;
  }
}

/**
 * Returns true if the given file extension (without dot) is a YAML extension.
 */
export function isYamlExtension(ext: string | undefined): boolean {
  return ext === "yaml" || ext === "yml";
}
