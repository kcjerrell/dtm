import "dotenv/config"
import fse from "fs-extra"

// put a version number as arg to change
const version = process.argv[2]

// read current version from package.json
const packageJson = await fse.readJSON("package.json")
const prevVersion = packageJson.version

if (!version) {
  console.log("Current version:", prevVersion)
  process.exit(0)
}

console.log("Changing version number from", prevVersion, "to", version)

// update package.json
if (compareVersions(version, prevVersion) <= 0) {
  throw new Error("Version must be greater than previous version")
}

packageJson.version = version
await fse.writeJSON("package.json", packageJson, { spaces: 2 })

// update tauri.conf.json
const tauriConfJson = await fse.readJSON("src-tauri/tauri.conf.json")
tauriConfJson.version = version
await fse.writeJSON("src-tauri/tauri.conf.json", tauriConfJson, { spaces: 2 })

// update Cargo.toml
const cargoToml = await fse.readFile("src-tauri/Cargo.toml", "utf-8")
const cargoTomlLines = cargoToml.split("\n")
const cargoTomlLinesUpdated = cargoTomlLines.map(line => {
  if (line.startsWith("version = ")) {
    return `version = "${version}"`
  }
  return line
})
await fse.writeFile("src-tauri/Cargo.toml", cargoTomlLinesUpdated.join("\n"))

function compareVersions(a: string, b: string): number {
  const splitAndPad = (version: string): number[] =>
    version
      .split('.')
      .map(num => parseInt(num, 10))
      .map(num => (isNaN(num) ? 0 : num));

  const aParts = splitAndPad(a);
  const bParts = splitAndPad(b);

  // Ensure equal length by padding with zeros
  const maxLength = Math.max(aParts.length, bParts.length);
  while (aParts.length < maxLength) aParts.push(0);
  while (bParts.length < maxLength) bParts.push(0);

  for (let i = 0; i < maxLength; i++) {
    if (aParts[i] > bParts[i]) return 1;
    if (aParts[i] < bParts[i]) return -1;
  }

  return 0;
}