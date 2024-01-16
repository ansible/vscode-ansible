export function getModelDetailsString(
  modelIdOverride: string | undefined,
  currentModelId: string | undefined
): string {
  const orgDefault = "(Red Hat org default)";
  if (modelIdOverride) {
    return modelIdOverride;
  } else if (currentModelId) {
    return `${currentModelId} ${orgDefault}`;
  } else {
    return orgDefault;
  }
}
