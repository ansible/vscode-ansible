/**
 * Internal skills manifest — exports all bundled skill content.
 * Used by SkillRegistry's 'builtin' source to expose skills via MCP tools.
 *
 * Each entry maps a skill ID to its raw markdown content (including frontmatter).
 * The .content.ts sidecar files are generated from .md source files by
 * scripts/generate-skill-content.mjs.
 */

import analyzeTaskResult from './analyze-task-result.content';
import buildTask from './build-task.content';
import detailExecutionEnv from './detail-execution-env.content';
import explainPlugin from './explain-plugin.content';
import guideEeDevcontainer from './guide-ee-devcontainer.content';
import overviewCollectionSources from './overview-collection-sources.content';
import overviewCreator from './overview-creator.content';
import summarizeCollection from './summarize-collection.content';
import summarizeCollections from './summarize-collections.content';
import summarizeExecutionEnvs from './summarize-execution-envs.content';
import summarizeGalaxySource from './summarize-galaxy-source.content';
import summarizeGithubSource from './summarize-github-source.content';
import summarizePlaybook from './summarize-playbook.content';
import walkthroughCreatorCommand from './walkthrough-creator-command.content';

/** Map of skill slug to raw markdown content (frontmatter + body). */
export const BUILTIN_SKILLS: Record<string, string> = {
    'analyze-task-result': analyzeTaskResult,
    'build-task': buildTask,
    'detail-execution-env': detailExecutionEnv,
    'explain-plugin': explainPlugin,
    'guide-ee-devcontainer': guideEeDevcontainer,
    'overview-collection-sources': overviewCollectionSources,
    'overview-creator': overviewCreator,
    'summarize-collection': summarizeCollection,
    'summarize-collections': summarizeCollections,
    'summarize-execution-envs': summarizeExecutionEnvs,
    'summarize-galaxy-source': summarizeGalaxySource,
    'summarize-github-source': summarizeGithubSource,
    'summarize-playbook': summarizePlaybook,
    'walkthrough-creator-command': walkthroughCreatorCommand,
};
