// Test stub for the `server-only` package. The real module throws when
// imported outside a React Server Component bundle; under Vitest (plain Node)
// the agent / lib code is exercised directly, so `server-only` is aliased to
// this no-op (see vitest.config.ts).
export {};
