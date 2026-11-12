import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const baseline = read("FORK.md").match(/\*\*`([a-f0-9]{40})`\*\*/)?.[1];
assert.ok(baseline, "FORK.md must identify the full upstream comparison SHA");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
try {
  git("cat-file", "-e", `${baseline}^{commit}`);
} catch {
  throw new Error(
    `Upstream baseline ${baseline} is unavailable. Fetch the repository's history before checking fork coverage.`,
  );
}
const paths = (output) => output.split("\0").filter(Boolean);
const changed = new Set([
  ...paths(git("diff", "--no-renames", "--name-only", "-z", baseline, "--")),
  ...paths(git("ls-files", "--others", "--exclude-standard", "-z")),
]);
const inventory = [...read(".fork/files.md").matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map(
  (match) => match[1],
);
assert.equal(new Set(inventory).size, inventory.length, "Duplicate paths in .fork/files.md");
assert.deepEqual(
  [...changed].sort(),
  [...inventory].sort(),
  "Update .fork/files.md for every changed path, including current uncommitted files",
);

const documents = [
  "FORK.md",
  "AGENTS.md",
  "README.md",
  ...fs
    .readdirSync(path.join(root, ".fork"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => `.fork/${file}`),
];
for (const file of documents) {
  for (const [, target] of read(file).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^(?:[a-z]+:|#)/i.test(target)) continue;
    const local = decodeURIComponent(target.split("#")[0]);
    if (!local) continue;
    assert.ok(
      fs.existsSync(path.resolve(root, path.dirname(file), local)),
      `${file}: missing link ${target}`,
    );
  }
}
console.log(`Fork record covers ${changed.size} changed paths; local documentation links resolve.`);
