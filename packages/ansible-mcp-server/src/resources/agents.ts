/**
 * The agents.md file is packaged with the extension for offline access.
 * This module provides section-based access to the guidelines,
 * returning only relevant content based on user queries.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Agents guidelines file packaged with the extension
// In compiled output, files are in out/server/src/resources/data/
// In source, files are in src/resources/data/
const AGENTS_FILE = path.join(__dirname, "data/agents.md");

/**
 * Represents a section from the agents.md file
 */
interface GuidelineSection {
  title: string;
  level: number;
  content: string;
  keywords: string[];
}

// Cache for parsed sections.
// No cache invalidation needed - agents.md is a packaged file that doesn't change at runtime.
let sectionsCache: GuidelineSection[] | null = null;

/**
 * Parse the agents.md file into sections based on markdown headers.
 */
async function parseGuidelines(): Promise<GuidelineSection[]> {
  if (sectionsCache) {
    return sectionsCache;
  }

  const content = await fs.readFile(AGENTS_FILE, "utf8");
  const lines = content.split("\n");
  const sections: GuidelineSection[] = [];

  let currentSection: GuidelineSection | null = null;
  let contentLines: string[] = [];

  for (const line of lines) {
    // Match markdown headers (# to ######)
    // Using non-greedy match and explicit non-whitespace to avoid ReDoS
    const headerMatch = line.match(/^(#{1,6})\s+(\S.*)$/);

    if (headerMatch) {
      // Save the previous section if exists
      if (currentSection) {
        currentSection.content = contentLines.join("\n").trim();
        sections.push(currentSection);
      }

      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      // Generate keywords from title (allow 2+ char words for terms like "EE")
      const keywords = title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((word) => word.length > 1);

      currentSection = {
        title,
        level,
        content: "",
        keywords,
      };
      contentLines = [];
    } else if (currentSection) {
      contentLines.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection) {
    currentSection.content = contentLines.join("\n").trim();
    sections.push(currentSection);
  }

  sectionsCache = sections;
  return sections;
}

/**
 * Get available topics from the guidelines.
 * Returns a formatted list of main sections users can ask about.
 */
export async function getAvailableTopics(): Promise<string> {
  const sections = await parseGuidelines();

  // Get main sections (level 2 headers)
  const mainSections = sections.filter((s) => s.level === 2);

  const topicsList = mainSections.map((s) => `- ${s.title}`).join("\n");

  return (
    `# Ansible Content Best Practices - Available Topics\n\n` +
    `You can ask about any of these topics:\n\n` +
    `${topicsList}\n\n` +
    `**Examples:**\n` +
    `- "Tell me about YAML formatting"\n` +
    `- "What are the naming conventions?"\n` +
    `- "How should I structure roles?"\n` +
    `- "What are the guiding principles?"\n\n` +
    `Ask about a specific topic to get detailed guidelines.`
  );
}

/**
 * Search for sections matching the given query.
 * Returns relevant sections based on keyword matching.
 */
export async function searchGuidelines(query: string): Promise<string> {
  const sections = await parseGuidelines();

  // Normalize query for matching (allow 2+ char words for terms like "EE")
  const queryWords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 1);

  // Score sections based on relevance
  const scoredSections = sections.map((section) => {
    let score = 0;
    const titleLower = section.title.toLowerCase();

    // Skip TOC and navigation sections - they just contain links, not actual content
    if (
      titleLower.includes("table of contents") ||
      titleLower.includes("toc") ||
      titleLower === "contents"
    ) {
      return { section, score: 0 };
    }

    // Check title match (high weight)
    for (const word of queryWords) {
      if (titleLower.includes(word)) {
        score += 10;
      }
    }

    // Check keyword match (medium weight)
    for (const word of queryWords) {
      if (section.keywords.some((kw) => kw.includes(word))) {
        score += 5;
      }
    }

    // Check content match (low weight, but skip if content is mostly links)
    const contentLower = section.content.toLowerCase();
    const linkCount = (section.content.match(/\]\(#/g) || []).length;
    const isNavigationSection = linkCount > 5; // If more than 5 internal links, likely a navigation section

    if (!isNavigationSection) {
      for (const word of queryWords) {
        if (contentLower.includes(word)) {
          score += 1;
        }
      }
    }

    return { section, score };
  });

  // Filter and sort by relevance
  const relevantSections = scoredSections
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // Limit to top 5 most relevant sections

  if (relevantSections.length === 0) {
    return (
      `No specific guidelines found for "${query}".\n\n` +
      `Try asking about:\n` +
      `- YAML formatting\n` +
      `- Naming conventions\n` +
      `- Roles structure\n` +
      `- Collections\n` +
      `- Playbooks\n` +
      `- Variables and inventories\n` +
      `- Testing strategies`
    );
  }

  // Build response with relevant sections
  const response: string[] = [];

  for (const { section } of relevantSections) {
    // Include the section header at appropriate level
    const headerPrefix = "#".repeat(section.level);
    response.push(`${headerPrefix} ${section.title}`);
    response.push("");

    // Include content (limit if too long)
    const contentLines = section.content.split("\n");
    if (contentLines.length > 50) {
      response.push(contentLines.slice(0, 50).join("\n"));
      response.push("\n... (content truncated, ask for more details)");
    } else {
      response.push(section.content);
    }

    response.push("");
  }

  return response.join("\n").trim();
}

/**
 * Get guidelines content based on an optional query.
 * If no query is provided, returns available topics.
 * If a query is provided, returns relevant sections.
 */
export async function getAgentsGuidelines(query?: string): Promise<string> {
  try {
    if (!query || query.trim() === "") {
      return await getAvailableTopics();
    }

    return await searchGuidelines(query);
  } catch (error) {
    throw new Error(
      `Error loading agents.md file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get the full agents.md file content (for MCP resource).
 */
export async function getFullAgentsGuidelines(): Promise<string> {
  try {
    const guidelinesContent = await fs.readFile(AGENTS_FILE, "utf8");
    return guidelinesContent;
  } catch (error) {
    throw new Error(
      `Error loading agents.md file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
