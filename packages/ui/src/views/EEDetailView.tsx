import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useBridge } from '../bridge/context';
import type { EEBridge, EEInfo, EECollection, EEPythonPackage, EEPackage } from '../bridge/ee';
import { TabBar } from '../components/TabBar';
import type { Tab } from '../components/TabBar';
import { PackageList } from '../components/PackageList';
import { InfoList } from '../components/InfoList';
import type { InfoItem } from '../components/InfoList';

interface EEDetailViewProps {
    eeName: string;
}

interface EEData {
    info: EEInfo;
    collections: EECollection[];
    pythonPackages: EEPythonPackage[];
    systemPackages: EEPackage[];
}

const styles: Record<string, CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ui-bg-primary)',
    },
    header: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--ui-border)',
    },
    title: {
        fontSize: '14px',
        fontWeight: 600,
        fontFamily: 'var(--ui-font-mono)',
        color: 'var(--ui-text-primary)',
        margin: 0,
        wordBreak: 'break-all',
    },
    loading: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 16px',
        color: 'var(--ui-text-secondary)',
        fontSize: '13px',
    },
    error: {
        padding: '16px',
        color: 'var(--ui-error)',
        fontSize: '13px',
    },
};

/**
 * Tabbed detail view for a single execution environment.
 * Fetches info, collections, Python packages, and system packages
 * through the EEBridge and renders them in a tabbed layout.
 * @param root0 - Component props.
 * @param root0.eeName - Full image name of the execution environment.
 * @returns The rendered EE detail view.
 */
export function EEDetailView({ eeName }: EEDetailViewProps) {
    const bridge = useBridge() as EEBridge;
    const [data, setData] = useState<EEData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('info');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [info, collections, pythonPackages, systemPackages] = await Promise.all([
                bridge.getInfo(eeName),
                bridge.getCollections(eeName),
                bridge.getPythonPackages(eeName),
                bridge.getSystemPackages(eeName),
            ]);
            setData({ info, collections, pythonPackages, systemPackages });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [bridge, eeName]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    if (loading) {
        return <div style={styles.loading}>Loading execution environment details…</div>;
    }

    if (error) {
        return <div style={styles.error}>Error: {error}</div>;
    }

    if (!data) {
        return <div style={styles.loading}>No data available</div>;
    }

    const infoItems: InfoItem[] = [];
    if (data.info.ansible) infoItems.push({ label: 'Ansible', value: data.info.ansible });
    if (data.info.os) infoItems.push({ label: 'OS', value: data.info.os });
    if (data.info.image) infoItems.push({ label: 'Image', value: data.info.image });

    const tabs: Tab[] = [
        { id: 'info', label: 'Info', count: infoItems.length },
        { id: 'collections', label: 'Collections', count: data.collections.length },
        { id: 'python', label: 'Python Packages', count: data.pythonPackages.length },
        { id: 'system', label: 'System Packages', count: data.systemPackages.length },
    ];

    return (
        <div style={styles.container} className="ansible-ui">
            <div style={styles.header}>
                <h2 style={styles.title}>{eeName}</h2>
            </div>
            <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
                {activeTab === 'info' && <InfoList items={infoItems} />}
                {activeTab === 'collections' && (
                    <PackageList packages={data.collections} title="Ansible Collections" />
                )}
                {activeTab === 'python' && (
                    <PackageList
                        packages={data.pythonPackages}
                        title="Python Packages"
                        onSelect={(name) => {
                            bridge.openPackageDetail(eeName, name, 'python');
                        }}
                    />
                )}
                {activeTab === 'system' && (
                    <PackageList
                        packages={data.systemPackages}
                        title="System Packages"
                        onSelect={(name) => {
                            bridge.openPackageDetail(eeName, name, 'system');
                        }}
                    />
                )}
            </TabBar>
        </div>
    );
}
