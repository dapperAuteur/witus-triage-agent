// Vitest setup — load local env so tests that call live services
// (e.g. the classify node hitting the Anthropic API) can read their keys.
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });
