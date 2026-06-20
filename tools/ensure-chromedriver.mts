#!/usr/bin/env node
// Keep the .mts extension so Node executes this as ESM (see tools/helper.mts).
/**
 * Workaround: Node.js 24.16's "harden ClientRequest options merge" breaks
 * WebdriverIO 8's chromedriver download via @puppeteer/browsers.
 * Pre-installs chromedriver so the framework finds it at the expected path
 * and skips its own (broken) download.
 *
 * Remove once WebdriverIO 9 migration lands.
 */
import { execFileSync } from 'node:child_process';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CACHE_DIR = process.env.CHROMEDRIVER_CACHE_DIR ?? '/tmp';
const WDIO_CACHE = join(process.cwd(), '.wdio-vscode');
/** Matches wdio.conf.ts `browserVersion` and @vscode/test-electron `version`. */
const WDIO_CHANNEL = 'stable';

const STABLE_RELEASES_URL = 'https://update.code.visualstudio.com/api/releases/stable';
const CGMANIFEST_BY_TAG_URL =
    'https://raw.githubusercontent.com/microsoft/vscode/{version}/cgmanifest.json';
const CGMANIFEST_BY_COMMIT_URL =
    'https://raw.githubusercontent.com/microsoft/vscode/{commit}/cgmanifest.json';
const MILESTONES_URL =
    'https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone.json';
const DOWNLOAD_URL =
    'https://storage.googleapis.com/chrome-for-testing-public/{version}/{folder}/chromedriver-{folder}.zip';

interface CgManifestRegistration {
    component: {
        git: { name: string };
    };
    version: string;
}

interface CgManifest {
    registrations: CgManifestRegistration[];
}

interface MilestonesJson {
    milestones: Record<string, { version: string }>;
}

interface PlatformInfo {
    platform: string;
    folder: string;
}

interface WdioVersionsEntry {
    chromedriver: string;
    vscode: string;
}

type WdioVersionsTxt = Record<string, WdioVersionsEntry>;

interface ProductJson {
    commit?: string;
}

/**
 *
 * @param url
 */
async function fetchText(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.text();
}

/**
 *
 * @param url
 */
async function fetchJson<T>(url: string): Promise<T> {
    const text = await fetchText(url);
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(`Invalid JSON from ${url}`);
    }
}

/**
 *
 */
async function getStableVscodeVersions(): Promise<string[]> {
    const versions = await fetchJson<string[]>(STABLE_RELEASES_URL);
    if (!Array.isArray(versions) || versions.length === 0) {
        throw new Error(`No stable VS Code releases from ${STABLE_RELEASES_URL}`);
    }
    return versions;
}

/**
 *
 * @param manifest
 */
function chromiumMajorFromCgmanifest(manifest: CgManifest): string | undefined {
    for (const registration of manifest.registrations) {
        if (registration.component.git.name === 'chromium') {
            return registration.version.split('.')[0];
        }
    }
    return undefined;
}

/**
 *
 * @param vscodeVersions
 */
async function resolveChromiumMajor(
    vscodeVersions: string[],
): Promise<{ vscodeVersion: string; chromiumMajor: string }> {
    const errors: string[] = [];

    for (const vscodeVersion of vscodeVersions) {
        const url = CGMANIFEST_BY_TAG_URL.replace('{version}', vscodeVersion);
        try {
            const manifest = await fetchJson<CgManifest>(url);
            const chromiumMajor = chromiumMajorFromCgmanifest(manifest);
            if (chromiumMajor !== undefined) {
                if (vscodeVersion !== vscodeVersions[0]) {
                    console.warn(
                        `Using cgmanifest from VS Code ${vscodeVersion} (no manifest for ${vscodeVersions[0]} yet)`,
                    );
                }
                return { chromiumMajor, vscodeVersion };
            }
            errors.push(`${vscodeVersion}: no chromium registration in cgmanifest`);
        } catch (err) {
            errors.push(`${vscodeVersion}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    throw new Error(`Could not determine Chromium major version. Attempts:\n${errors.join('\n')}`);
}

/**
 *
 * @param chromiumMajor
 */
async function getChromedriverVersion(chromiumMajor: string): Promise<string> {
    const milestones = await fetchJson<MilestonesJson>(MILESTONES_URL);
    const version = milestones.milestones[chromiumMajor]?.version;
    if (version === undefined || version.length === 0) {
        throw new Error(`No chromedriver available for Chromium milestone ${chromiumMajor}`);
    }
    return version;
}

/**
 *
 */
function resolvePlatform(): PlatformInfo {
    const key = `${process.platform}-${process.arch}`;
    switch (key) {
        case 'linux-x64':
            return { folder: 'linux64', platform: 'linux' };
        case 'darwin-arm64':
            return { folder: 'mac-arm64', platform: 'mac' };
        case 'darwin-x64':
            return { folder: 'mac-x64', platform: 'mac' };
        case 'win32-x64':
            return { folder: 'win64', platform: 'win' };
        default:
            throw new Error(`Unsupported platform: ${key}`);
    }
}

/**
 *
 * @param url
 * @param destination
 */
async function downloadFile(url: string, destination: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }
    writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

/**
 *
 * @param zipPath
 * @param destination
 */
function extractZip(zipPath: string, destination: string): void {
    if (process.platform === 'win32') {
        execFileSync(
            'powershell',
            ['-Command', `Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${destination}'`],
            { stdio: 'inherit' },
        );
    } else {
        execFileSync('unzip', ['-qo', zipPath, '-d', destination], {
            stdio: 'inherit',
        });
    }
}

/**
 *
 * @param cacheDir
 * @param platform
 * @param chromedriverVersion
 * @param folder
 */
function driverPaths(
    cacheDir: string,
    platform: string,
    chromedriverVersion: string,
    folder: string,
): { driverDir: string; driverBin: string } {
    const driverDir = join(cacheDir, 'chromedriver', `${platform}-${chromedriverVersion}`);
    const exe = process.platform === 'win32' ? 'chromedriver.exe' : 'chromedriver';
    const driverBin = join(driverDir, `chromedriver-${folder}`, exe);
    return { driverBin, driverDir };
}

/**
 *
 */
function vscodeInstallDirPrefix(): string {
    const key = `${process.platform}-${process.arch}`;
    switch (key) {
        case 'linux-x64':
            return 'vscode-linux-x64';
        case 'darwin-arm64':
            return 'vscode-darwin-arm64';
        case 'darwin-x64':
            return 'vscode-darwin-x64';
        case 'win32-x64':
            return 'vscode-win32-x64';
        default:
            throw new Error(`Unsupported platform: ${key}`);
    }
}

/**
 *
 * @param wdioCache
 */
function listInstalledVscodeVersions(wdioCache: string): string[] {
    if (!existsSync(wdioCache)) {
        return [];
    }
    const prefix = `${vscodeInstallDirPrefix()}-`;
    return readdirSync(wdioCache)
        .filter((name) => name.startsWith(prefix))
        .map((name) => name.slice(prefix.length));
}

/**
 *
 * @param installed
 * @param stableOrder
 */
function pickInstalledVscodeVersion(
    installed: string[],
    stableOrder: string[],
): string | undefined {
    for (const version of stableOrder) {
        if (installed.includes(version)) {
            return version;
        }
    }
    return installed.at(-1);
}

/**
 *
 * @param wdioCache
 * @param vscodeVersion
 */
function vscodeInstallDir(wdioCache: string, vscodeVersion: string): string {
    return join(wdioCache, `${vscodeInstallDirPrefix()}-${vscodeVersion}`);
}

/**
 *
 * @param installDir
 */
function vscodeProductJsonPath(installDir: string): string {
    if (process.platform === 'darwin') {
        return join(
            installDir,
            'Visual Studio Code.app',
            'Contents',
            'Resources',
            'app',
            'product.json',
        );
    }
    return join(installDir, 'resources', 'app', 'product.json');
}

/**
 *
 * @param wdioCache
 * @param vscodeVersion
 */
async function resolveChromiumMajorFromInstall(
    wdioCache: string,
    vscodeVersion: string,
): Promise<string | undefined> {
    const installDir = vscodeInstallDir(wdioCache, vscodeVersion);
    const productPath = vscodeProductJsonPath(installDir);
    if (!existsSync(productPath)) {
        return undefined;
    }

    const product = JSON.parse(readFileSync(productPath, 'utf8')) as ProductJson;
    const { commit } = product;
    if (commit === undefined || commit.length === 0) {
        return undefined;
    }

    const url = CGMANIFEST_BY_COMMIT_URL.replace('{commit}', commit);
    const manifest = await fetchJson<CgManifest>(url);
    const chromiumMajor = chromiumMajorFromCgmanifest(manifest);
    if (chromiumMajor === undefined) {
        throw new Error(`No chromium registration in cgmanifest from commit ${commit}`);
    }
    console.log(
        `Resolved Chromium ${chromiumMajor} from installed VS Code ${vscodeVersion} (commit ${commit.slice(0, 12)}…)`,
    );
    return chromiumMajor;
}

/**
 *
 * @param wdioCache
 * @param vscodeVersions
 */
async function resolveChromiumMajorForWdio(
    wdioCache: string,
    vscodeVersions: string[],
): Promise<string> {
    const installed = listInstalledVscodeVersions(wdioCache);
    const vscodeVersion = pickInstalledVscodeVersion(installed, vscodeVersions);
    if (vscodeVersion !== undefined) {
        try {
            const major = await resolveChromiumMajorFromInstall(wdioCache, vscodeVersion);
            if (major !== undefined) {
                return major;
            }
        } catch (err) {
            console.warn(
                `Could not read Chromium from installed VS Code ${vscodeVersion}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            );
        }
    }

    const { chromiumMajor } = await resolveChromiumMajor(vscodeVersions);
    return chromiumMajor;
}

/**
 *
 * @param wdioCache
 * @param vscodeVersion
 * @param chromiumMajor
 */
function writeWdioVersionsCache(
    wdioCache: string,
    vscodeVersion: string,
    chromiumMajor: string,
): void {
    const versionsPath = join(wdioCache, 'versions.txt');
    let content: WdioVersionsTxt = {};
    if (existsSync(versionsPath)) {
        content = JSON.parse(readFileSync(versionsPath, 'utf8')) as WdioVersionsTxt;
    }
    content[WDIO_CHANNEL] = {
        chromedriver: chromiumMajor,
        vscode: vscodeVersion,
    };
    mkdirSync(wdioCache, { recursive: true });
    writeFileSync(versionsPath, `${JSON.stringify(content, null, 4)}\n`);
    console.log(
        `Wrote ${versionsPath} (${WDIO_CHANNEL}: vscode ${vscodeVersion}, chromedriver ${chromiumMajor})`,
    );
}

/**
 *
 * @param platform
 * @param folder
 * @param chromedriverVersion
 */
async function ensureChromedriverBinary(
    platform: string,
    folder: string,
    chromedriverVersion: string,
): Promise<void> {
    const { driverDir, driverBin } = driverPaths(CACHE_DIR, platform, chromedriverVersion, folder);

    if (existsSync(driverBin)) {
        try {
            chmodSync(driverBin, 0o755);
        } catch {
            // may already be executable
        }
        console.log(`Chromedriver ${chromedriverVersion} already available at ${driverBin}`);
        return;
    }

    console.log(`Downloading chromedriver ${chromedriverVersion} for ${platform}/${folder}...`);
    mkdirSync(driverDir, { recursive: true });

    const downloadUrl = DOWNLOAD_URL.replace('{version}', chromedriverVersion).replace(
        /{folder}/g,
        folder,
    );
    const tmpDir = mkdtempSync(join(tmpdir(), 'chromedriver-'));
    const tmpZip = join(tmpDir, 'chromedriver.zip');

    try {
        await downloadFile(downloadUrl, tmpZip);
        extractZip(tmpZip, driverDir);
        chmodSync(driverBin, 0o755);
        console.log(`Chromedriver ${chromedriverVersion} installed at ${driverBin}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`ERROR: Failed to download chromedriver from ${downloadUrl}`);
        console.error(message);
        process.exit(1);
    } finally {
        rmSync(tmpDir, { force: true, recursive: true });
    }
}

/**
 *
 */
async function main(): Promise<void> {
    const vscodeVersions = await getStableVscodeVersions();
    const chromiumMajor = await resolveChromiumMajorForWdio(WDIO_CACHE, vscodeVersions);
    const chromedriverVersion = await getChromedriverVersion(chromiumMajor);
    const { platform, folder } = resolvePlatform();

    await ensureChromedriverBinary(platform, folder, chromedriverVersion);

    const installedVscode = listInstalledVscodeVersions(WDIO_CACHE);
    const vscodeForCache =
        pickInstalledVscodeVersion(installedVscode, vscodeVersions) ?? vscodeVersions[0];
    writeWdioVersionsCache(WDIO_CACHE, vscodeForCache, chromiumMajor);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
