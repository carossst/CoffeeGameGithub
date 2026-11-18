// Generates answers/<slug>/index.html, answers/index.html and sitemap.xml from seo-pages.json.
// Usage: node scripts/generate-seo.mjs          (write)
//        node scripts/generate-seo.mjs --check  (fail if generated files are out of date)

import fs from "node:fs";
import path from "node:path";
import { ROOT, loadSeo, loadContent, validate, buildOutputs, staleDirs, GENERATED_MARK } from "./seo-lib.mjs";

const check = process.argv.includes("--check");
const seo = loadSeo();
const content = loadContent();

const errors = validate(seo, content);
if (errors.length) {
  console.error("seo-pages.json is invalid:\n- " + errors.join("\n- "));
  process.exit(1);
}

const outputs = buildOutputs(seo, content);
const stale = staleDirs(outputs);
const hubPath = path.join(ROOT, "answers/index.html");
const staleHub = !outputs.has("answers/index.html") && fs.existsSync(hubPath);
const problems = [];

for (const [rel, text] of outputs) {
  const file = path.join(ROOT, rel);
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (current === text) continue;
  if (check) {
    problems.push(`${rel} is out of date`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    console.log(`wrote ${rel}`);
  }
}

for (const rel of [...stale, ...(staleHub ? ["answers/index.html"] : [])]) {
  const target = path.join(ROOT, rel);
  const file = fs.statSync(target).isDirectory() ? path.join(target, "index.html") : target;
  if (!fs.existsSync(file) || !fs.readFileSync(file, "utf8").includes(GENERATED_MARK)) continue;
  if (check) {
    problems.push(`${rel} is stale (no matching page)`);
  } else {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`removed ${rel}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n") + "\nRun: npm run generate:seo");
  process.exit(1);
}
console.log(check ? "SEO files are up to date." : "SEO files generated.");
