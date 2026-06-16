/**
 * Types for container runtime operations.
 */

/** Supported container engine. */
export type ContainerEngine = 'podman' | 'docker';

/** Normalized image record from `{engine} images --format json`. */
export interface ContainerImage {
    id: string;
    repository: string;
    tag: string;
    created: string;
    size: string;
    names: string[];
}

/** Result of `{engine} inspect` with EE classification. */
export interface InspectedImage extends ContainerImage {
    executionEnvironment: boolean;
    inspect: {
        config: {
            labels: Record<string, string>;
            workingDir: string;
        };
        architecture?: string;
        os?: string;
    };
}
