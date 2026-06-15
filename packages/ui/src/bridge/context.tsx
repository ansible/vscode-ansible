import { createContext, useContext } from 'react';
import type { HostBridgeCore } from './core';

const BridgeContext = createContext<HostBridgeCore | null>(null);

export const BridgeProvider = BridgeContext.Provider;

/**
 * Access the host bridge from any shared UI component.
 * Cast the return value to a specific bridge interface when the view
 * requires capabilities beyond HostBridgeCore.
 * @returns The host bridge provided by the nearest BridgeProvider.
 */
export function useBridge(): HostBridgeCore {
    const bridge = useContext(BridgeContext);
    if (!bridge) {
        throw new Error('useBridge must be used within a BridgeProvider');
    }
    return bridge;
}
