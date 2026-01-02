---
trigger: model_decision
description: Info and guidelines for the project browser feature (backend)
---

## Overview

#### ProjectsDB
This project creates and owns an sqlite database for indexing Draw Things projets. In the backend,  this is referred to as `projects_db`, and its API is in src-tauri/src/projects_db/projects_db.rs.

#### DTProjects
- DTProjects are sqlite database created by the Draw Things app, and in the backend are referred to as dt_projects.
- The primary API is in src-tauri/src/projects_db/dt_project.rs.
- Data within these databases is stored in flatbuffers, and the flatc code for reading the binary columns is in src-tauri/src/projects_db/fbs (this code should never be modified).
- DT Project files are NOT owned by this app, and should only ever be acessed in read-only mode.
- The entities of interest are tensorhistorynode, texthistorynode, and tensors, and thumbnailhistorynode

#### DTM
- DTM is a protocol for fetching resources from within a DT project with a url like dtm://dtproject/tensor/${projectId}/${name}

## Commands
Tauri commands for DTProjects or ProjectsDB are located in src-tauri/src/projects_db/commands.rs
These should all have a corresponding invoke wrapper, and types, in src/commands/projects.ts
All commands must be included in src-tauri/src/lib.rs
Commands should all follow the same naming scheme, either projects_db or dt_projects (depending on whether it operates on this app's db or on a Draw Things project file), followed by the domain or entity, and a verb. For example, a function that updated things in a project file would be dt_projects_things_update. A function that listed foos matching bars might be called projects_db_list_foos_by_bars.