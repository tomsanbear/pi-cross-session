import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const { createJiti } = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"))(
  "jiti",
);
const load = createJiti(import.meta.url);
const { isHello, isMessage, isResponse } = await load.import("../lib/protocol.ts");
const { trimOldest } = await load.import("../lib/collections.ts");
const root = fileURLToPath(new URL("../", import.meta.url));
function sources(directory, extension = ".ts") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file, extension) : file.endsWith(extension) ? [file] : [];
  });
}

test("production source has no explicit any, non-null assertions or TypeScript suppression directives", () => {
  const violations = [];
  for (const file of [
    ...sources(path.join(root, "extensions")),
    ...sources(path.join(root, "lib")),
  ]) {
    const text = fs.readFileSync(file, "utf8"),
      source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (node.kind === ts.SyntaxKind.AnyKeyword || ts.isNonNullExpression(node)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        violations.push(`${path.relative(root, file)}:${line + 1}: ${ts.SyntaxKind[node.kind]}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.doesNotMatch(text, /@ts-(?:ignore|nocheck)/, file);
  }
  assert.deepEqual(violations, []);
});

test("JavaScript fixtures and fork tooling have no unused imports, locals or parameters", () => {
  // An unused-code audit, not a claim that controlled JS stubs implement the entire SDK type surface.
  const files = [
    ...sources(path.join(root, "test"), ".mjs"),
    ...sources(path.join(root, ".fork"), ".mjs"),
  ];
  const program = ts.createProgram(files, {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const unusedCodes = new Set([6133, 6192, 6196, 6138]);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => unusedCodes.has(d.code) && d.file && !d.file.fileName.includes("node_modules"));
  assert.deepEqual(
    diagnostics.map(
      (d) => `${d.file.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
    ),
    [],
  );
});

test("wire guards reject malformed nested identity and optional metadata", () => {
  const peer = { id: "session", instanceId: "a".repeat(32), pid: 1 };
  const response = {
    v: 1,
    type: "response",
    requestId: "request",
    ok: true,
    status: "ready",
    peer,
  };
  assert.equal(isResponse(response), true);
  for (const invalid of [
    null,
    [],
    1,
    "peer",
    { ...peer, pid: "1" },
    { ...peer, pid: 0 },
    { ...peer, instanceId: "wrong" },
  ])
    assert.equal(isResponse({ ...response, peer: invalid }), false, JSON.stringify(invalid));
  for (const value of [null, [], true, 1, "x"]) {
    assert.equal(isResponse(value), false);
    assert.equal(isHello(value), false);
    assert.equal(isMessage(value), false);
  }
  assert.equal(isResponse({ ...response, retryable: "yes" }), false);
});

test("collection eviction preserves insertion order and validates bounds", () => {
  const map = new Map([
    ["first", 1],
    ["second", 2],
    ["third", 3],
  ]);
  trimOldest(map, 2);
  assert.deepEqual([...map.keys()], ["second", "third"]);
  const set = new Set(["first", "second"]);
  trimOldest(set, 1);
  assert.deepEqual([...set], ["second"]);
  trimOldest(set, 0);
  assert.equal(set.size, 0);
  for (const invalid of [-1, 0.5, Infinity])
    assert.throws(() => trimOldest(map, invalid), RangeError);
});
