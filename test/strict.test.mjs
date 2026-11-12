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
const { MeshContinuations } = await load.import("../lib/mesh-continuation.ts");
const { PeerGoals, GOAL_ENTRY } = await load.import("../lib/peer-goal.ts");
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
    const text = fs.readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
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
  // Deliberately an unused-code audit, not a claim that controlled JS stubs
  // implement the entire SDK type surface. Production types are checked by tsc.
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
  ]) {
    assert.equal(isResponse({ ...response, peer: invalid }), false, JSON.stringify(invalid));
  }
  for (const value of [null, [], true, 1, "x"]) {
    assert.equal(isResponse(value), false);
    assert.equal(isHello(value), false);
    assert.equal(isMessage(value), false);
  }
  assert.equal(isResponse({ ...response, expiresAt: "123" }), false);
});

test("Mesh continuation validates adaptive options instead of treating arrays as objects", () => {
  const scope = { sessionId: "session", cwd: "/fixture" };
  for (const adaptive of [
    [],
    { maxRuns: 0 },
    { maxRuns: "1" },
    { maxRuns: 1.5 },
    { maxRuns: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const mesh = new MeshContinuations();
    const input = { action: "run", tasks: [{ task: "repair" }], autoContinuation: adaptive };
    let issued = false;
    mesh.note("call", input, scope);
    mesh.issue({
      version: 1,
      callId: "call",
      input: JSON.stringify(input),
      ...scope,
      reply: () => {
        issued = true;
      },
    });
    assert.equal(issued, false, JSON.stringify(adaptive));
  }
  const mesh = new MeshContinuations();
  for (const invalid of [null, [], true, "x", { callId: 5 }])
    assert.doesNotThrow(() => mesh.issue(invalid));
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

test("malformed unrelated journal fields never erase exact revoked ownership", () => {
  const entries = [
    {
      type: "custom",
      customType: GOAL_ENTRY,
      data: {
        goalId: "revoked",
        runs: ["known-mesh", null],
        agents: 42,
        subagentRuns: ["known-subagent", 7],
      },
    },
  ];
  const goals = new PeerGoals(
    () => entries,
    () => {},
  );
  assert.equal(goals.owner("mesh", "known-mesh"), "revoked");
  assert.equal(goals.owner("subagent", "known-subagent"), "revoked");
  assert.equal(goals.owner("agent", "unknown"), undefined);
});

test("malformed journal ownership is ignored rather than trusted through a cast", () => {
  for (const bad of [
    null,
    1,
    [],
    { goalId: "goal", runs: 42 },
    { goalId: "goal", agents: "id" },
    { goalId: "goal", subagentRuns: [1] },
  ]) {
    const entries = [{ type: "custom", customType: GOAL_ENTRY, data: bad }];
    const goals = new PeerGoals(
      () => entries,
      () => {},
    );
    for (const kind of ["mesh", "agent", "subagent"])
      assert.equal(goals.owner(kind, "id"), undefined);
  }
});
