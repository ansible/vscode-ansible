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

/**
 * Bridge contract for execution environment detail views.
 * Host implementations fetch data from @ansible/core services
 * (extension, Navita) or REST APIs (Backstage).
 */
export interface EEBridge extends HostBridgeCore {
    getInfo(eeName: string): Promise<EEInfo>;
    getCollections(eeName: string): Promise<EECollection[]>;
    getPythonPackages(eeName: string): Promise<EEPythonPackage[]>;
    getSystemPackages(eeName: string): Promise<EEPackage[]>;
}
