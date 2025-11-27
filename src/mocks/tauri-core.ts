export const invoke = async (cmd: string, args?: any) => {
  console.log(`[Mock] invoke: ${cmd}`, args);
  
  switch (cmd) {
    case "projects_db_project_list":
      return [];
    case "projects_db_image_list":
      return { items: [], total: 0 };
    case "projects_db_watch_folder_list":
      return [];
    case "dt_project_get_tensor_history":
      return [];
    case "projects_db_image_count":
      return 0;
    case "projects_db_project_add":
      return {
        id: 1,
        path: args?.path || "/mock/project",
        image_count: 0,
        filesize: 0,
        modified: Date.now(),
        excluded: false,
      };
    case "projects_db_project_remove":
    case "projects_db_project_scan":
    case "projects_db_project_update_exclude":
    case "projects_db_project_scan_all":
    case "projects_db_image_rebuild_fts":
    case "projects_db_watch_folder_add":
    case "projects_db_watch_folder_remove":
    case "projects_db_watch_folder_update":
    case "projects_db_scan_model_info":
      return undefined;
    case "dt_project_get_thumb_half":
    case "dt_project_get_tensor":
    case "dt_project_decode_tensor":
      return new Uint8Array();
    case "dt_project_get_history_full":
      return {
        row_id: 1,
        lineage: 0,
        logical_time: 0,
        moodboard_ids: [],
        history: {},
        project_path: "/mock/project",
      };
    case "dt_project_get_tensor_raw":
      return {
        tensor_type: 0,
        data_type: 0,
        format: 0,
        width: 512,
        height: 512,
        channels: 3,
        dim: new ArrayBuffer(0),
        data: new ArrayBuffer(0),
      };
    case "dt_project_get_tensor_size":
      return { width: 512, height: 512, channels: 3 };
    case "dt_project_find_predecessor_candidates":
      return [];
    case "read_clipboard_types":
      return [];
    case "read_clipboard_strings":
      return {};
    case "read_clipboard_binary":
      return new Uint8Array();
    case "fetch_image_file":
      return new Uint8Array();
    case "write_clipboard_binary":
      return undefined;
    default:
      console.warn(`[Mock] Unhandled command: ${cmd}`);
      return undefined;
  }
};

export const convertFileSrc = (filePath: string) => {
  return `http://localhost:1420/mock-assets/${filePath}`;
};
