---
trigger: always_on
---

## Project Overview
**DTM** is a companion app for the AI image generation app **Draw Things (DT)**. It enhances DT workflows and provides access to data missing in DT. The app has multiple tools, each with a corresponding `<App/>` view accessible via the sidebar.

### Tools

#### Metadata
- Displays Draw Things image metadata (prompts, configs, etc.) for easy copy and reference.
- Details pane has two tabs: Config shows Draw Things metdata, and Details shows all image metadata.
- Supports multiple images via clipboard or drag-and-drop.
- Root component: `src/metadata/Metadata.tsx`.

#### Projects
- Browse and search across multiple DT projects.
- Images indexed in `projects_db` (SQLite, managed by Rust backend).
- Features are basic currently.
- Root component: `src/dtProjects/DTProjects.tsx`.

## Code Guidelines

### Valtio State
- Use `useProxyRef()` (from `src/hooks/valtioHooks.ts`) to create proxies in components.
- Proxy naming:
  - Component-level: `state` or `somethingState`.
  - Module-level (persistent/synced): `store`.
- Snapshots: always named `snap` or `somethingSnap`.
- Rules:
  1. Access state in render **only via snapshots** (`useSnapshot()`).
  2. Mutate/access state **outside render** via the proxy object directly.
  3. Never use `state` in render or `snap` outside render — this breaks reactivity.

### UI Components
- Uses **Chakra UI** and **Framer Motion**.
- Style props can be applied inline during design.
- Once finalized, extract base components into reusable components/recipes.