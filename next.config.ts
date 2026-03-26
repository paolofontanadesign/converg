import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

// Next.js 16 + Turbopack doesn't reliably load .env.local into process.env
// for Route Handlers. Read it explicitly here at config time.
function loadEnvLocal(): Record<string, string> {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    return Object.fromEntries(
      content.split("\n")
        .filter(l => l.includes("=") && !l.startsWith("#"))
        .map(l => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim()]; })
    );
  } catch { return {}; }
}

const localEnv = loadEnvLocal();

const nextConfig: NextConfig = {
  devIndicators: false,
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || localEnv.ANTHROPIC_API_KEY || "",
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || localEnv.YOUTUBE_API_KEY || "",
    BING_API_KEY: process.env.BING_API_KEY || localEnv.BING_API_KEY || "",
    NEWSAPI_KEY: process.env.NEWSAPI_KEY || localEnv.NEWSAPI_KEY || "",
  },
};

export default nextConfig;
