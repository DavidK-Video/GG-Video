/**
 * Converts various truthy representations to a boolean.
 * Handles: true, "true", "1", 1, "yes", "on", etc.
 */
export function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
  return false;
}
git commit --allow-empty -m "trigger redeploy"
git push
