// apps/ey-smart-checkin-mcp-server/src/mcp-check-in/common/ssci-mock.util.ts
export function isMockEnabled(override?: boolean): boolean {
  if (typeof override === 'boolean') return override;
  const env = String(process.env.MOCK_SSCI ?? '').toLowerCase();
  if (!env) return true;
  return env === 'true';
}
  
  export async function maybeMockDelay(): Promise<void> {
    const ms = Number(process.env.MOCK_SSCI_DELAY_MS ?? 0);
    if (Number.isFinite(ms) && ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }
  
  export function normalizeHeaderOverrides(
    headers?: Record<string, unknown>,
  ): Partial<Record<string, string>> | undefined {
    if (!headers || typeof headers !== 'object') return undefined;
    return Object.fromEntries(
      Object.entries(headers).filter(([, v]) => typeof v === 'string' && v.length > 0),
    ) as Partial<Record<string, string>>;
  }
  
