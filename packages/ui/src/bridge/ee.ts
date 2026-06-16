import type { HostBridgeCore } from './core';

export interface EEPackage {
    name: string;
    version: string;
}

export interface EEPythonPackage {
    name: string;
    version: string;
    summary?: string;
}

export interface EECollection {
    name: string;
    version: string;
}

export interface EEInfo {
    ansible?: string;
    os?: string;
    image?: string;
}

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

/**
 * Bridge contract for execution environment detail views.
 * Host implementations fetch data from @ansible/services
 * (extension) or REST APIs (Backstage).
 */
export interface EEBridge extends HostBridgeCore {
    getInfo(eeName: string): Promise<EEInfo>;
    getCollections(eeName: string): Promise<EECollection[]>;
    getPythonPackages(eeName: string): Promise<EEPythonPackage[]>;
    getSystemPackages(eeName: string): Promise<EEPackage[]>;
    getPythonPackageDetail(
        eeName: string,
        packageName: string,
    ): Promise<PythonPackageDetail | undefined>;
    getSystemPackageDetail(
        eeName: string,
        packageName: string,
    ): Promise<SystemPackageDetail | undefined>;
    openPackageDetail(eeName: string, packageName: string, packageType: 'python' | 'system'): void;
}
