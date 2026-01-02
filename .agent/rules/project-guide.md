---
trigger: always_on
---

## Commands
Tauri commands for DTProjects or ProjectsDB are located in src-tauri/src/projects_db/commands.rs
These should all have a corresponding invoke wrapper, and types, in src/commands/projects.ts
All commands must be included in src-tauri/src/lib.rs
Commands should all follow the same naming scheme, either projects_db or dt_projects (depending on whether it operates on this app's db or on a Draw Things project file), followed by the domain or entity, and a verb. For example, a function that updated things in a project file would be dt_projects_things_update. A function that listed foos matching bars might be called projects_db_list_foos_by_bars.