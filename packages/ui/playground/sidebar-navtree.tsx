import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SidebarShell } from '../src/sidebar/SidebarShell';
import type { SidebarSectionId } from '../src/sidebar/types';
import { buildMockSnapshot, type PlaygroundScenario } from './mock-snapshot';
import '../src/styles/tokens.css';
import '../src/styles/vscode-host.css';
import '../src/sidebar/sidebar.css';
import './vscode-theme.css';

type Theme = 'dark' | 'light';

function PlaygroundApp() {
    const [theme, setTheme] = useState<Theme>('dark');
    const [scenario, setScenario] = useState<PlaygroundScenario>('healthy');
    const [openSectionId, setOpenSectionId] = useState<SidebarSectionId | null>(null);
    const [lastAction, setLastAction] = useState<string | null>(null);

    const snapshot = buildMockSnapshot(scenario);

    useEffect(() => {
        document.documentElement.classList.remove('theme-dark', 'theme-light');
        document.documentElement.classList.add(`theme-${theme}`);
    }, [theme]);

    useEffect(() => {
        setOpenSectionId(snapshot.suggestedOpenSectionId ?? null);
    }, [scenario, snapshot.suggestedOpenSectionId]);

    return (
        <div className="playground-page">
            <header className="playground-header">
                <h1>Ansible sidebar NavTree</h1>
                <p>
                    Phase 0 fidelity spike — accordion shell + mock trees. Compare to the native
                    Ansible Activity Bar drawer.
                </p>
            </header>

            <div className="playground-controls">
                <label>
                    Theme
                    <select
                        value={theme}
                        onChange={(e) => setTheme(e.target.value as Theme)}
                    >
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                    </select>
                </label>
                <label>
                    Scenario
                    <select
                        value={scenario}
                        onChange={(e) => setScenario(e.target.value as PlaygroundScenario)}
                    >
                        <option value="healthy">Healthy (all collapsed)</option>
                        <option value="missingPython">Issue: no Python</option>
                        <option value="missingAdt">Issue: missing ADT</option>
                    </select>
                </label>
                <button type="button" onClick={() => setOpenSectionId(null)}>
                    Collapse all
                </button>
            </div>

            <div className="playground-stage">
                <div className="playground-sidebar-frame">
                    <SidebarShell
                        snapshot={snapshot}
                        openSectionId={openSectionId}
                        onOpenSectionChange={setOpenSectionId}
                        onWelcomeAction={(command) => setLastAction(command)}
                        onNodeAction={(command, nodeId) =>
                            setLastAction(`${command} (${nodeId})`)
                        }
                    />
                </div>
                <aside className="playground-notes">
                    <strong>Check</strong>
                    <ul>
                        <li>All sections closed on Healthy</li>
                        <li>Opening one section closes the other</li>
                        <li>Welcome buttons on empty/issue sections</li>
                        <li>
                            Hover a plugin → book + sparkle; playbook → play + graph + sparkle
                        </li>
                    </ul>
                    <p>
                        Open section: <code>{openSectionId ?? 'null'}</code>
                    </p>
                    <p>
                        Last action: <code>{lastAction ?? '—'}</code>
                    </p>
                </aside>
            </div>
        </div>
    );
}

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <PlaygroundApp />
        </StrictMode>,
    );
}
