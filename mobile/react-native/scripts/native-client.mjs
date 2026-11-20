// Tells whether the installed dev client still matches native inputs (deps, config, plugins).
//   node scripts/native-client.mjs check <ios|android>   exit 0: reuse client, 2: rebuild needed
//   node scripts/native-client.mjs save <ios|android>    record after installing a fresh build
import { readFileSync, writeFileSync } from "node:fs";
import { createFingerprintAsync } from "expo/fingerprint";

const [command, platform] = process.argv.slice(2);
if (!["check", "save"].includes(command) || !["ios", "android"].includes(platform)) {
  console.error("usage: native-client.mjs <check|save> <ios|android>");
  process.exit(1);
}
// Same exclusions as EAS: generated ios/ and android/ directories are outputs, not inputs.
const { hash } = await createFingerprintAsync(".", { platforms: [platform], ignorePaths: ["ios/**", "android/**"] });
const file = `.expo/native-client-${platform}.txt`;
if (command === "save") {
  writeFileSync(file, hash);
  console.log(`${platform} client recorded: ${hash}`);
} else {
  let saved = "";
  try { saved = readFileSync(file, "utf8").trim(); } catch {}
  if (saved === hash) console.log(`${platform}: installed client matches (${hash}); Metro reload is enough.`);
  else {
    console.log(`${platform}: native inputs changed (${saved || "no recorded client"} -> ${hash}); rebuild and reinstall the dev client.`);
    process.exit(2);
  }
}
