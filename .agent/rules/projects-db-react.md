---
trigger: model_decision
description: Info and guidelines for the project browser feature (frontend)
---

## DTProjects Tool Overview
- Purpose: Index, browse, and search Draw Things projects (not possible within DT).  
- Projects are included via watch folders; supports multiple folders, including removable/external storage.  
- Generated images are stored in `projects2.db` with prompts, models, and config.  
  - DB size: ~15MB for 25k images.  
  - Optional thumbnails increase DB size to ~1GB for 25k images (total project size ~100GB).  

## Core Architecture

### Entry Point
- `useDTP()`: returns all DTP services and state controllers.  
- Controllers are lazily initialized by the module; lifecycle **not managed by React**.

### Container & Services
- `Container<DTPServices>`:
  - Holds all services and controllers types.  
  - Initializes services via `servicesInit` callback; `DTPService` registers automatically.  
  - Subscribes to Tauri events (should be in subclass).  
  - Provides EventEmitter functionality for inter-service communication.  
  - Implements a 'tags' system for state invalidation; controllers can register for tags.  
  - Provides access to existing and future services (order of initialization does not matter).  
  - `dispose()` cleans up subscriptions, listeners, and services.

### Service Base Class (`DTPService`)
- Registers itself with the container.  
- Provides protected access to the container.  
- `dispose()` can be overridden.  
- `watchProxy()` helper for automatic unwatch on disposal.

### StateController Base Class (`DTPStateController`)
- Extends `DTPService`.  
- Abstract `state` property (expected to be a Valtio proxy).  
- `useSnap()` hook for React components; must follow React hooks rules.  
- `handleTags()` can be overridden to use the tags system.

### Dependencies & Testing
- Some services depend on others (e.g., scanner uses watchfolders, projects, models).  
- Goal: allow easier debugging and testing of services in isolation where possible.  
- Event-driven communication is preferred to reduce direct dependencies.