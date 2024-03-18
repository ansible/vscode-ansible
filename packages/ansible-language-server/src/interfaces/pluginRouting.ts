export type IPluginRoutingByCollection = Map<string, IPluginRoutesByType>;

export type IPluginTypes = "modules"; // currently only modules are supported

export type IPluginRoutesByType = Map<IPluginTypes, IPluginRoutesByName>;

export type IPluginRoutesByName = Map<string, IPluginRoute>;
export interface IPluginRoute {
  redirect?: string;
  deprecation?: {
    removalVersion?: string;
    removalDate?: string;
    warningText?: string;
  };
  tombstone?: {
    removalVersion?: string;
    removalDate?: string;
    warningText?: string;
  };
}
