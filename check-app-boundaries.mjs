import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDirs = ["admin-app", "manager-app", "client-app"];
const sourceExt = new Set([".ts", ".tsx", ".js", ".jsx"]);
const violations = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        stack.push(abs);
        continue;
      }
      if (sourceExt.has(path.extname(entry.name))) out.push(abs);
    }
  }
  return out;
}

function importTargets(sourceText) {
  const regex = /\b(?:import|export)\b[\s\S]*?\bfrom\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  const targets = [];
  for (const match of sourceText.matchAll(regex)) {
    targets.push(match[1] ?? match[2] ?? "");
  }
  return targets.filter(Boolean);
}

for (const app of appDirs) {
  const srcDir = path.join(root, "apps", app, "src");
  const files = walk(srcDir);
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const imports = importTargets(content);
    for (const imp of imports) {
      for (const other of appDirs) {
        if (other === app) continue;
        if (imp.includes(`/apps/${other}/`) || imp.includes(`\\apps\\${other}\\`) || imp.includes(`${other}/src/`)) {
          violations.push({
            file: path.relative(root, filePath),
            importPath: imp,
            app,
            target: other,
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("App boundary violation(s) found:");
  for (const v of violations) {
    console.error(`- ${v.file} imports "${v.importPath}" (${v.app} -> ${v.target})`);
  }
  process.exit(1);
}

console.log("App boundaries OK.");
