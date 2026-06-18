/**
 * Types for the AI skill registry.
 */

/** Broad skill category. */
export type SkillCategory = 'standards' | 'sdlc' | 'domain' | 'scaffold' | 'workflow' | 'other';

/** How much the source is trusted. */
export type TrustLevel = 'community' | 'certified' | 'partner' | 'private';

/** Detected repository layout convention. */
export type RepoFormat = 'lola' | 'vercel' | 'generic';

/** Describes a location from which skills can be loaded. */
export interface SkillSource {
    /** Unique identifier for this source. */
    id: string;
    /** Transport type: github, registry (future), local disk, or builtin. */
    type: 'github' | 'registry' | 'local' | 'builtin';
    /** URL or path for the source. */
    url: string;
    /** Trust level applied to all skills from this source. */
    trust: TrustLevel;
    /** Hours between automatic refreshes (default: 24). */
    refreshInterval?: number;
}

/** A single indexed skill. */
export interface SkillEntry {
    /** Globally unique ID, e.g. "ai-forge/ansible-collection-sdlc/commit". */
    id: string;
    /** Source ID this skill came from. */
    source: string;
    /** Module or collection grouping. */
    module: string;
    /** Human-readable skill name. */
    name: string;
    /** Short description. */
    description: string;
    /** Phrases that trigger this skill. */
    triggers: string[];
    /** Broad category. */
    category: SkillCategory;
    /** Optional domain qualifier (e.g. "cloud", "network"). */
    domain?: string;
    /** Trust level inherited from the source. */
    trust: TrustLevel;
    /** Freeform tags for search. */
    tags: string[];
}
