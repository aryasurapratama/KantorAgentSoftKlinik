// Keep the standalone check aligned with server.js's local default. Container
// images set PORT=8787; local runs remain overrideable through PORT or HEALTHCHECK_URL.
const endpoint = process.env.HEALTHCHECK_URL || `http://127.0.0.1:${process.env.PORT || 4318}/api/health`;
try {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body?.ok !== true) throw new Error('health endpoint returned ok=false');
  process.exit(0);
} catch (error) {
  console.error(`healthcheck failed: ${error.message}`);
  process.exit(1);
}
