---
trigger: model_decision
description: Info and guidelines for the project browser feature (backend)
---

### ProjectsDB
- SQLite database owned by DTM for indexing Draw Things projects (`projects_db`).
- Backend API: `src-tauri/src/projects_db/projects_db.rs`.

### DTProjects
- Draw Things project databases (`dt_projects`), **read-only**.
- Backend API: `src-tauri/src/projects_db/dt_project.rs`.
- Data stored in FlatBuffers; code in `src-tauri/src/projects_db/fbs` **must not be modified**.
- Entities of interest: `tensorhistorynode`, `texthistorynode`, `tensors`, `thumbnailhistorynode`.

### DTM Protocol
- Fetch resources from DT projects using URLs like:  
  `dtm://dtproject/tensor/${projectId}/${name}`.

## Commands
- Tauri commands for ProjectsDB and DTProjects are in `src-tauri/src/projects_db/commands.rs`.
- Each command must have a corresponding invoke wrapper and types in `src/commands/projects.ts`.
- All commands must be included in `src-tauri/src/lib.rs`.
- Naming conventions:
  - Prefix: `projects_db` (app-owned DB) or `dt_projects` (DT project file).  
  - Format: `[prefix]_[domain/entity]_[verb]`.  
  - Examples:
    - Update in a project file: `dt_projects_things_update`
    - List matching items: `projects_db_list_foos_by_bars`