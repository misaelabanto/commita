#!/usr/bin/env node

// Skip if already running under Bun or in CI
if (process.versions.bun || process.env.CI) {
  process.exit(0);
}

try {
  const { execSync } = require("child_process");
  execSync("bun --version", { stdio: "ignore" });

  // Bun is available but they installed via npm/node
  console.error(
    "\n" +
      "  \x1b[36m[commita]\x1b[0m Bun detected on your system!\n" +
      "  \x1b[36m[commita]\x1b[0m For better performance, consider reinstalling with:\n" +
      "  \x1b[36m[commita]\x1b[0m   \x1b[1mbun install -g @misaelabanto/commita\x1b[0m\n"
  );
} catch {
  // Bun not found — that's fine, Node.js works too
}
