---
trigger: always_on
---

## Project description
This project/app, called DTM, is intended as a companion app for the AI image generation app Draw Things. It contains a number of features that make working with Draw Things easier - enabling workflows and access to data where DT is lacking.  These features are divided into distinct tools, each with a corresponding view that is rendered in <App/> along with a a sidebar for switching between views. The following tools are currently available:

#### Metadata
It's an image viewer focusing on presenting the metadata in Draw Things generated images. Images can be added via clipboard or drag and drop. Draw Things specific data such as prompts and config are presented and can be easily copied for using in DT. Multiple images can be opened and pinned for quick access to frequently referenced image. A separate tab lists all available metadata in the image.
- Root component is in src/metadata/Metadata.tsx

#### Projects
The projects tool lets you browse and search accross many separate DT projects at once. Images from all included projects are indexed within 'projects_db', an sqlite database handled by the Rust backend. Currently the features in this tool are fairly basic.
- Root component is in src/dtProjects/DTProjects.tsx


## Code guidelines
This project makes extensive use of Valtio state proxies.
- Genereally, proxies should be created and stored using a ref. src/hooks/valtioHooks.ts provides useProxyRef(). The proxy object should usually be called `state` or `somethingState`, indicating that it is a valtio proxy
- In certain cases, state proxies are created in the module scope, allowing them to live outside of React lifecycles. These are sometimes named `store` especially if they are synced to the backend and persisted to disk.
- Snapshots should always use the name `snap` or `somethingSnap`. 
- It is imperative that when using valtio state proxies that...
-- Within the component's render function, data is only accessed through a snapshot provided by useSnapshot(). Any component consuming a snapshot via useSnapshot will be rerendered when the state is updated.
-- Any mutation or access outside of render (event callbacks, effects, etc) must use the actual state object.
-- Using state within render or snap outside of render WILL create problems. Don't do it!

## Components
This project makes extensive use of Chakra and Motion components. It is common to use style props directly while designing components/views. When layout and style is finalized, the base components should be extracted into separate components/recipes. See the chakra-component workflow for more information.