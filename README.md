# DTM

## Building

To build the app on Mac, you will need to have [Node/NPM](https://nodejs.org/en/download), and [Rust](https://www.rust-lang.org/tools/install) installed, as well as the Xcode command line tools (`xcode-select --install`)

```bash
npm install
npm run gen:icons

# Build the app for current architecture
npm run build:mac

# Build for Mac Universal
npm run build:universal

# Run in dev mode
npm run dev
```