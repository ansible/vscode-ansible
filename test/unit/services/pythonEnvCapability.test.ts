import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PythonEnvCapability } from '../../../src/services/PythonEnvironmentService';

vi.mock('vscode', () => ({
    extensions: { getExtension: vi.fn() },
    workspace: { workspaceFolders: [] },
    window: {
        createTerminal: vi.fn(),
        showInputBox: vi.fn(),
        showWarningMessage: vi.fn(),
        showErrorMessage: vi.fn(),
    },
    commands: { executeCommand: vi.fn() },
    EventEmitter: class {
        fire = vi.fn();
        event = vi.fn();
        dispose = vi.fn();
    },
    Uri: { file: (p: string) => ({ fsPath: p }) },
}));

vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    realpathSync: vi.fn((p: string) => p),
}));

vi.mock('@vscode/python-extension', () => ({
    PythonExtension: { api: vi.fn() },
}));

vi.mock('@src/extension', () => ({
    log: vi.fn(),
}));

import { PythonEnvironmentService } from '../../../src/services/PythonEnvironmentService';

/**
 * Build a service instance with specific internal state for testing
 * the capability model without real VS Code extension activation.
 * @param opts - configuration for the mock service state
 * @param opts.hasEnvsApi - whether the python-envs extension API is present
 * @param opts.hasPythonExt - whether ms-python.python is installed
 * @param opts.petAvailable - whether the PET extension is available
 * @returns a configured PythonEnvironmentService singleton
 */
function createServiceWithState(opts: {
    hasEnvsApi: boolean;
    hasPythonExt: boolean;
    petAvailable: boolean;
}): PythonEnvironmentService {
    // Reset singleton
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PythonEnvironmentService as any)._instance = undefined;
    const svc = PythonEnvironmentService.getInstance();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const any = svc as any;
    any._pythonEnvApi = opts.hasEnvsApi ? { getEnvironment: vi.fn() } : undefined;
    any._pythonExtApi = opts.hasPythonExt ? { environments: {} } : undefined;
    any._petAvailable = opts.petAvailable;

    return svc;
}

describe('PythonEnvCapability model', () => {
    beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (PythonEnvironmentService as any)._instance = undefined;
    });

    const cases: {
        label: string;
        state: { hasEnvsApi: boolean; hasPythonExt: boolean; petAvailable: boolean };
        expected: {
            capability: PythonEnvCapability;
            prefersEnvs: boolean;
            canCreate: boolean;
            canInstall: boolean;
            writePath: 'api' | 'terminal' | 'none';
            hint: boolean;
        };
    }[] = [
        {
            label: 'full — python-envs + PET',
            state: { hasEnvsApi: true, hasPythonExt: false, petAvailable: true },
            expected: {
                capability: 'full',
                prefersEnvs: true,
                canCreate: true,
                canInstall: true,
                writePath: 'api',
                hint: false,
            },
        },
        {
            label: 'envs-no-pet — python-envs without PET',
            state: { hasEnvsApi: true, hasPythonExt: true, petAvailable: false },
            expected: {
                capability: 'envs-no-pet',
                prefersEnvs: true,
                canCreate: true,
                canInstall: true,
                writePath: 'api',
                hint: false,
            },
        },
        {
            label: 'python-only — ms-python.python fallback',
            state: { hasEnvsApi: false, hasPythonExt: true, petAvailable: false },
            expected: {
                capability: 'python-only',
                prefersEnvs: false,
                canCreate: true,
                canInstall: true,
                writePath: 'terminal',
                hint: true,
            },
        },
        {
            label: 'unavailable — no Python extension',
            state: { hasEnvsApi: false, hasPythonExt: false, petAvailable: false },
            expected: {
                capability: 'unavailable',
                prefersEnvs: false,
                canCreate: false,
                canInstall: false,
                writePath: 'none',
                hint: true,
            },
        },
    ];

    for (const { label, state, expected } of cases) {
        describe(label, () => {
            it(`getCapability() returns '${expected.capability}'`, () => {
                const svc = createServiceWithState(state);
                expect(svc.getCapability()).toBe(expected.capability);
            });

            it(`prefersEnvsExtension() returns ${String(expected.prefersEnvs)}`, () => {
                const svc = createServiceWithState(state);
                expect(svc.prefersEnvsExtension()).toBe(expected.prefersEnvs);
            });

            it(`canCreateEnvironment() returns ${String(expected.canCreate)}`, () => {
                const svc = createServiceWithState(state);
                expect(svc.canCreateEnvironment()).toBe(expected.canCreate);
            });

            it(`canInstallPackages() returns ${String(expected.canInstall)}`, () => {
                const svc = createServiceWithState(state);
                expect(svc.canInstallPackages()).toBe(expected.canInstall);
            });

            it(`getActiveWritePath() returns '${expected.writePath}'`, () => {
                const svc = createServiceWithState(state);
                expect(svc.getActiveWritePath()).toBe(expected.writePath);
            });

            it(`getMissingExtensionHint() ${expected.hint ? 'returns a hint' : 'returns undefined'}`, () => {
                const svc = createServiceWithState(state);
                const hint = svc.getMissingExtensionHint();
                if (expected.hint) {
                    expect(hint).toBeDefined();
                    expect(typeof hint).toBe('string');
                } else {
                    expect(hint).toBeUndefined();
                }
            });
        });
    }

    it('isAvailable() reflects backend presence', () => {
        const svc = createServiceWithState({
            hasEnvsApi: false,
            hasPythonExt: true,
            petAvailable: false,
        });
        expect(svc.isAvailable()).toBe(true);

        const svc2 = createServiceWithState({
            hasEnvsApi: false,
            hasPythonExt: false,
            petAvailable: false,
        });
        expect(svc2.isAvailable()).toBe(false);
    });

    it('hasEnvsExtension() is true only with envs API', () => {
        const svc = createServiceWithState({
            hasEnvsApi: true,
            hasPythonExt: false,
            petAvailable: false,
        });
        expect(svc.hasEnvsExtension()).toBe(true);

        const svc2 = createServiceWithState({
            hasEnvsApi: false,
            hasPythonExt: true,
            petAvailable: false,
        });
        expect(svc2.hasEnvsExtension()).toBe(false);
    });

    it('hasFullApi() requires both envs API and PET', () => {
        const full = createServiceWithState({
            hasEnvsApi: true,
            hasPythonExt: false,
            petAvailable: true,
        });
        expect(full.hasFullApi()).toBe(true);

        const noPet = createServiceWithState({
            hasEnvsApi: true,
            hasPythonExt: false,
            petAvailable: false,
        });
        expect(noPet.hasFullApi()).toBe(false);
    });
});
