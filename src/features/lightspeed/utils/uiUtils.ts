export function getModelDetailsString(
  modelIdOverride: string | undefined,
  currentModelId: string | undefined
): string {
  const orgDefault = "(Red Hat org default)";
  return modelIdOverride
    ? modelIdOverride
    : currentModelId
    ? `${currentModelId} ${orgDefault}`
    : orgDefault;
}
