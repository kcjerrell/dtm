// I think making a build/release script with ts is okay
// usually people use a shell script but I'm gonna be calling github apis so....

// dotenv for TAURI_SIGNING_PRIVATE_KEY

// put a version number as arg
import "dotenv/config"
import fse from "fs-extra"
import { exec, spawn } from 'node:child_process'
import { Octokit } from "@octokit/rest"

const startTime = Date.now() - 60 * 15 * 1000

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})
const repo = {
  owner: "kcjerrell",
  repo: "dtm",
  headers: {
    'X-GitHub-Api-Version': '2022-11-28'
  }
}

const version = process.argv[2]
if (!version) throw new Error("Please provide a version number as an argument")

if (!process.env.TAURI_SIGNING_PRIVATE_KEY)
  throw new Error("TAURI_SIGNING_PRIVATE_KEY is not set")

console.log("Creating release for version", version)

// update package.json
const packageJson = await fse.readJSON("package.json")
const prevVersion = packageJson.version
if (compareVersions(version, prevVersion) <= 0) {
  // throw new Error("Version must be greater than previous version")
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

// yarn tauri build
// make sure exec is set up so you can enter your password when needed
// await runTauriBuild()

// make sure we have everything
const dmgPath = `./src-tauri/target/universal-apple-darwin/release/bundle/dmg/DTM_${version}_universal.dmg`
// const dmgPath = `./src-tauri/target/release/bundle/dmg/DTM_${version}_aarch64.dmg`
if (!fse.existsSync(dmgPath)) {
  throw new Error(`Could not find ${dmgPath}`)
}
const dmgData = await fse.readFile(dmgPath)

const tarGzPath = `./src-tauri/target/universal-apple-darwin/release/bundle/macos/DTM.app.tar.gz`
if (!fse.existsSync(tarGzPath))
  throw new Error(`Could not find ${tarGzPath}`)
if (fse.statSync(tarGzPath).ctimeMs < startTime)
  throw new Error('tar.gz is old')
const tarGzData = await fse.readFile(tarGzPath)

const tarGzSigPath = `./src-tauri/target/universal-apple-darwin/release/bundle/macos/DTM.app.tar.gz.sig`
if (!fse.existsSync(tarGzSigPath))
  throw new Error(`Could not find ${tarGzSigPath}`)
if (fse.statSync(tarGzSigPath).ctimeMs < startTime)
  throw new Error('tar.gz.sig is old')
const tarGzSigData = await fse.readFile(tarGzSigPath, 'utf-8')

// add release.json
const releaseJson = {
  "version": version,
  "pub_date": new Date().toISOString(),
  "platforms": {
    "darwin-aarch64": {
      "signature": tarGzSigData,
      "url": `https://github.com/kcjerrell/dt-metadata/releases/download/v${version}/DTM.app.tar.gz`
    }
  }
}
await fse.writeJson("./docs/release.json", releaseJson, { spaces: 2 })

await exec(`git commit -a -m "v${version} release"`)
await exec('git push')

// create release
const release = await createRelease(version)

// add dmg
const dmgRes = await octokit.repos.uploadReleaseAsset({
  ...repo,
  release_id: release.id,
  name: `DTM_${version}_aarch64.dmg`,
  data: dmgData as unknown as string,
  headers: {
    "content-type": "application/zip",
    "content-length": dmgData.length,
  },
})
if (dmgRes.status !== 201)
  throw new Error("Failed to upload release asset")
console.log("Uploaded release asset:", dmgRes.data.url)

// add tar.gz
const tarGzRes = await octokit.repos.uploadReleaseAsset({
  ...repo,
  release_id: release.id,
  name: `DTM.app.tar.gz`,
  data: tarGzData as unknown as string,
  headers: {
    "content-type": "application/gzip",
    "content-length": tarGzData.length,
  },
})
if (tarGzRes.status !== 201)
  throw new Error("Failed to upload release asset")
console.log("Uploaded release asset:", tarGzRes.data.url)


async function createRelease(tag: string) {
  console.log("Creating release...")
  const res = await octokit.repos.createRelease({
    ...repo,
    tag_name: `v${version}`,
    name: `v${version}`,
    target_commitish: "main",
  })

  if (res.status !== 201) {
    throw new Error("Failed to create release")
  }
  console.log("Created release:", res.data.html_url)
  return res.data
}

async function runTauriBuild() {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["run", "build:universal"], {
      stdio: "inherit", // inherit console output
      env: {
        ...process.env, // keep existing env vars

      },
      shell: true, // ensures it works cross-platform
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build failed with code ${code}`));
      }
    });
  });
}

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