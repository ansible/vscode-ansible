/**
 * Types for execution environment management.
 */

/** Information about an execution environment container image. */
export interface ExecutionEnvironment {
    created: string;
    execution_environment: boolean;
    full_name: string;
    image_id: string;
}

/** Detailed information about an execution environment. */
export interface EEDetails {
    ansible_collections?: {
        details: Record<string, string>;
    };
    ansible_version?: {
        details: string;
    };
    redhat_release?: {
        details: string;
    };
    system_packages?: {
        details: {
            name: string;
            version: string;
            release?: string;
            architecture?: string;
            description?: string;
            size?: string;
            license?: string;
            url?: string;
            [key: string]: string | undefined;
        }[];
    };
    python_packages?: {
        details: {
            name: string;
            version: string;
            summary?: string;
            'home-page'?: string;
            author?: string;
            'author-email'?: string;
            license?: string;
            location?: string;
            requires?: string[];
            'required-by'?: string[];
        }[];
    };
    os_release?: {
        details: {
            'pretty-name'?: string;
            name?: string;
            version?: string;
        }[];
    };
    image_name?: string;
}

/** Detailed metadata for a single Python package inside an EE. */
export interface PythonPackageDetail {
    name: string;
    version: string;
    summary: string;
    license: string;
    homepage: string;
    author: string;
    authorEmail: string;
    location: string;
    requires: string[];
    requiredBy: string[];
}

/** Detailed metadata for a single system package inside an EE. */
export interface SystemPackageDetail {
    name: string;
    version: string;
    release: string;
    arch: string;
    description: string;
    size: string;
    license: string;
    url: string;
}
