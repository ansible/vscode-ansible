/**
 * Ansible-specific context processing and prompt engineering
 * Ported from ansible-ai-connect-service/ansible_ai_connect/ai/api/formatter.py
 */

import * as yaml from "js-yaml";

export interface AnsibleFileType {
  type: "playbook" | "tasks" | "handlers" | "vars" | "role" | "inventory";
}

export interface AnsibleContext {
  fileType: AnsibleFileType["type"];
  documentUri?: string;
  workspaceContext?: {
    roles?: string[];
    collections?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables?: Record<string, any>;
  };
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AnsibleContextProcessor {
  /**
   * Apply Ansible-specific prompt engineering and context injection
   */
  static enhancePromptForAnsible(
    prompt: string,
    context: string = "",
    ansibleContext?: AnsibleContext,
  ): string {
    // Combine context and prompt
    const fullInput = context ? `${context}\n${prompt}` : prompt;

    // Detect if this is a multi-task prompt (contains multiple task definitions)
    const isMultiTask = this.isMultiTaskPrompt(prompt);

    // Apply Ansible-specific preprocessing
    const processed = this.preprocessAnsibleContent(
      fullInput,
      ansibleContext?.fileType || "playbook",
    );

    // Add Ansible-specific system context
    const systemContext = this.getAnsibleSystemContext(
      ansibleContext?.fileType || "playbook",
    );

    // Handle multi-task vs single-task scenarios
    if (isMultiTask) {
      return `${systemContext}\n\n${processed}`;
    } else {
      // For single tasks, ensure proper formatting
      const formattedPrompt = this.formatSingleTaskPrompt(processed);
      return `${systemContext}\n\n${formattedPrompt}`;
    }
  }

  /**
   * Get Ansible-specific system context based on file type
   */
  private static getAnsibleSystemContext(fileType: string): string {
    const baseContext = `You are an expert Ansible developer. Generate valid, idiomatic Ansible YAML following best practices.

Key requirements:
- Use proper YAML syntax and indentation (2 spaces)
- Follow Ansible naming conventions
- Use fully qualified collection names (FQCN) when appropriate
- Include meaningful task names
- Use appropriate Ansible modules and parameters
- Follow security best practices`;

    const typeSpecificContext = {
      playbook: `
Generate Ansible playbook content with:
- Proper play structure with hosts, tasks, etc.
- Appropriate use of become, vars, handlers
- Well-structured task definitions`,

      tasks: `
Generate Ansible task definitions with:
- Clear, descriptive task names
- Proper module usage and parameters
- Appropriate conditionals and loops
- Error handling where needed`,

      handlers: `
Generate Ansible handler definitions with:
- Descriptive handler names
- Proper service/restart operations
- Appropriate listen directives`,

      role: `
Generate Ansible role structure with:
- Proper directory organization
- Main tasks, defaults, handlers, meta
- Reusable and parameterized content`,

      vars: `
Generate Ansible variable definitions with:
- Clear variable naming conventions
- Proper data structures
- Documentation comments`,

      inventory: `
Generate Ansible inventory content with:
- Proper host and group definitions
- Appropriate variable assignments
- Clear organization structure`,
    };

    return (
      baseContext +
      (typeSpecificContext[fileType as keyof typeof typeSpecificContext] || "")
    );
  }

  /**
   * Detect if prompt contains multiple task definitions
   */
  private static isMultiTaskPrompt(prompt: string): boolean {
    // Count occurrences of task indicators
    const taskIndicators = [
      /^\s*-\s+name:/gm, // YAML list item with name
      /^\s*-\s+\w+:/gm, // YAML list item with module
    ];

    let taskCount = 0;
    for (const indicator of taskIndicators) {
      const matches = prompt.match(indicator);
      if (matches) {
        taskCount += matches.length;
      }
    }

    return taskCount > 1;
  }

  /**
   * Preprocess Ansible content for normalization
   */
  private static preprocessAnsibleContent(
    content: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _fileType: string,
  ): string {
    try {
      // Parse and re-serialize to normalize YAML formatting
      const parsed = yaml.load(content);
      if (parsed === null || parsed === undefined) {
        return content;
      }

      // Re-serialize with Ansible-friendly options
      const normalized = yaml.dump(parsed, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
        sortKeys: false,
      });

      return normalized.trim();
    } catch (error) {
      // If YAML parsing fails, return original content
      console.warn("Failed to normalize Ansible YAML:", error);
      return content;
    }
  }

  /**
   * Format single task prompt with proper structure
   */
  private static formatSingleTaskPrompt(prompt: string): string {
    // Ensure prompt ends with proper task structure
    const trimmed = prompt.trim();

    // If it doesn't start with a task indicator, add one
    if (!trimmed.match(/^\s*-\s+name:/m) && !trimmed.match(/^\s*-\s+\w+:/m)) {
      // Check if it's just a task name or description
      if (!trimmed.includes(":")) {
        return `- name: ${trimmed}\n  `;
      }
    }

    return trimmed;
  }

  /**
   * Extract task names from prompt for multi-task scenarios
   */
  static extractTaskNames(prompt: string): string[] {
    const taskNames: string[] = [];
    const nameMatches = prompt.match(/^\s*-\s+name:\s*(.+)$/gm);

    if (nameMatches) {
      for (const match of nameMatches) {
        const name = match.replace(/^\s*-\s+name:\s*/, "").trim();
        if (name) {
          taskNames.push(name);
        }
      }
    }

    return taskNames;
  }

  /**
   * Clean and validate Ansible output from LLM
   */
  static cleanAnsibleOutput(output: string): string {
    let cleaned = output.trim();

    // Remove common LLM artifacts
    cleaned = cleaned.replace(/^```ya?ml\s*/i, "");
    cleaned = cleaned.replace(/```\s*$/, "");
    cleaned = cleaned.replace(/^```\s*/, "");

    // Remove explanatory text that might precede the YAML
    const yamlStart = cleaned.search(/^\s*(-\s+name:|---|\w+:)/m);
    if (yamlStart > 0) {
      cleaned = cleaned.substring(yamlStart);
    }

    // Ensure proper YAML structure
    try {
      const parsed = yaml.load(cleaned);
      if (parsed !== null) {
        // Re-serialize to ensure valid YAML
        cleaned = yaml
          .dump(parsed, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
            quotingType: '"',
            forceQuotes: false,
          })
          .trim();
      }
    } catch (error) {
      console.warn("Output validation failed, returning as-is:", error);
    }

    return cleaned;
  }

  /**
   * Validate that output is valid Ansible content
   */
  static validateAnsibleContent(content: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      const parsed = yaml.load(content);

      if (parsed === null || parsed === undefined) {
        errors.push("Content is empty or invalid YAML");
        return { valid: false, errors };
      }

      // Basic Ansible structure validation
      if (Array.isArray(parsed)) {
        // Task list or playbook
        for (const item of parsed) {
          if (typeof item !== "object") {
            errors.push("Invalid task or play structure");
            continue;
          }

          // Check for required fields in tasks
          if (
            "name" in item ||
            Object.keys(item).some(
              (key) => key !== "name" && !key.startsWith("_"),
            )
          ) {
            // Looks like a task or play
            continue;
          } else {
            errors.push("Task missing name or module");
          }
        }
      } else if (typeof parsed === "object") {
        // Single play or role structure
        if (!("hosts" in parsed || "tasks" in parsed || "main" in parsed)) {
          errors.push("Invalid playbook or role structure");
        }
      }
    } catch (yamlError) {
      errors.push(`YAML syntax error: ${yamlError}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Add Ansible-specific stop sequences for better completion
   */
  static getAnsibleStopSequences(): string[] {
    return [
      "\n\n---", // Document separator
      "\n\n- hosts:", // New play
      "\n\n- name:", // New task (with spacing)
      "\n\nhandlers:", // Handlers section
      "\nvars:", // Variables section
      "\ntasks:", // Tasks section
    ];
  }

  /**
   * Get appropriate temperature settings for different Ansible content types
   */
  static getTemperatureForFileType(fileType: string): number {
    const temperatures = {
      playbook: 0.1, // Low for structured content
      tasks: 0.1, // Low for precise task definitions
      handlers: 0.05, // Very low for handlers
      vars: 0.0, // Deterministic for variables
      role: 0.15, // Slightly higher for creative role structure
      inventory: 0.0, // Deterministic for inventory
    };

    return temperatures[fileType as keyof typeof temperatures] || 0.1;
  }

  /**
   * Get max tokens based on content type
   */
  static getMaxTokensForFileType(fileType: string): number {
    const maxTokens = {
      playbook: 2000, // Large for full playbooks
      tasks: 800, // Medium for task lists
      handlers: 400, // Small for handlers
      vars: 600, // Medium for variable definitions
      role: 2500, // Large for role structure
      inventory: 1000, // Medium for inventory
    };

    return maxTokens[fileType as keyof typeof maxTokens] || 1000;
  }
}
