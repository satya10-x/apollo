import dotenv from "dotenv";
import { z } from "zod";
import { fileURLToPath } from "node:url";
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
const optionalPrice = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().finite().nonnegative().optional(),
);
const schema = z.object({
  MONGODB_URI: z.string().default(""),
  GROQ_API_KEY: z.string().default(""),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_FALLBACK_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  GROQ_INPUT_USD_PER_MILLION: optionalPrice,
  GROQ_OUTPUT_USD_PER_MILLION: optionalPrice,
  GEMINI_INPUT_USD_PER_MILLION: optionalPrice,
  GEMINI_OUTPUT_USD_PER_MILLION: optionalPrice,
  TAVILY_USD_PER_REQUEST: optionalPrice,
  APOLLO_MAX_ROUNDS: z.coerce.number().int().min(1).max(5).default(5),
  APOLLO_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(3600000)
    .default(1200000),
  APOLLO_MAX_SEARCH_REQUESTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(72),
  APOLLO_MAX_TOKENS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(2000000)
    .default(600000),
  APOLLO_MAX_COST_USD: optionalPrice,
  TAVILY_API_KEY: z.string().default(""),
  EXA_API_KEY: z.string().default(""),
  EXA_FALLBACK_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  EXA_USD_PER_REQUEST: optionalPrice,
  ATHENA_SEARCH_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  ATHENA_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
  ATHENA_SEARCH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(30000),
  ATHENA_ARXIV_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  ATHENA_ARXIV_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(3000)
    .max(60000)
    .default(3000),
  HOST: z.string().min(1).default(
    process.env.RENDER === "true" || process.env.NODE_ENV === "production"
      ? "0.0.0.0"
      : "127.0.0.1",
  ),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_URL: z.url().default("http://127.0.0.1:5173"),
});
// Render's public proxy cannot reach a loopback listener, even if an old
// HOST value was copied into its environment or the root .env file.
export const env = Object.freeze(schema.parse({
  ...process.env,
  ...(process.env.RENDER === "true" ? { HOST: "0.0.0.0" } : {}),
}));
