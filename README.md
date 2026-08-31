<p align="center">
  <h1 align="center">DTM</h1>
  <p align="center">
    <strong>A power-user companion app for <a href="https://drawthings.ai">Draw Things</a></strong>
  </p>
  <p align="center">
    Browse thousands of generated images · Extract & inspect metadata · Search with natural language
  </p>
</p>

---

## Why DTM?

[Draw Things](https://drawthings.ai) is a powerful, local AI image generation app — but once you've generated hundreds or thousands of images across multiple projects, managing them becomes its own challenge. DTM fills the gaps:

- **Can't remember which prompt produced that great result?** DTM extracts and displays the full generation config from any Draw Things image — prompts, model, sampler, seed, guidance scale, and more.
- **Projects scattered across folders and external drives?** DTM indexes them all into a single, searchable library.
- **Need to find images by prompt, model, or parameter?** DTM offers full-text search with filters so you can query your entire creative history instantly.

### 🔍 Metadata Inspector
<img width="600" height="400" alt="image" src="https://github.com/user-attachments/assets/c80728c9-705a-4e2c-a1a5-5a6080eddea2" />

Drop or paste any Draw Things image to instantly view its full generation metadata:

- **Prompts** — positive and negative, ready to copy
- **Generation config** — model, sampler, steps, seed, guidance scale, dimensions, and every other parameter Draw Things embeds
- **Multi-image support** — load several images at once, pin the ones you want to keep
- **One-click actions** — copy image, save a copy, open the source folder

### 📂 Project Browser
<img width="600" height="400" alt="image" src="https://github.com/user-attachments/assets/ddc6255b-1a53-4a86-9060-e22cc5769564" />

A unified library across all your Draw Things projects:

- **Watch folders** — point DTM at your Draw Things data folder (or any folder) and it continuously indexes new images in the background
- **Full-text search** — find images by prompt keywords with stemming and prefix matching
- **Structured filters** — narrow results by model, sampler, seed, steps, dimensions, and more
- **Detail overlay** — select any image to view its full metadata and generation history
- **External storage** — index projects from external drives, network folders, or anywhere macOS can reach

## Installation

### Download (Recommended)

1. Grab the latest `.dmg` from [GitHub Releases](https://github.com/kcjerrell/dtm/releases)
2. Open the `.dmg` and drag **DTM** to your Applications folder
3. On first launch, macOS will block the app because it isn't signed with an Apple Developer certificate. To allow it:
   - Open **System Settings → Privacy & Security**
   - Scroll down to the Security section — you'll see a message about DTM being blocked
   - Click **Open Anyway** and confirm

### Build from Source

**Prerequisites:** [Node.js / npm](https://nodejs.org/), [Rust](https://www.rust-lang.org/tools/install), Xcode command line tools (`xcode-select --install`)

```bash
# Install dependencies
npm install

# Generate app icons
npm run gen:icons

# Build for current architecture
npm run build:mac

# Build Universal binary (Intel + Apple Silicon)
npm run build:universal

# Run in dev mode
npm run dev
```

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE) — see the LICENSE file for details.

DTM uses FlatBuffer schema files from the [drawthings-community](https://github.com/nicedrawthings/drawthings-community) repository, which is licensed under GPL-v3.
