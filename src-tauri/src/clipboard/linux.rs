pub fn write_clipboard_binary(_ty: String, _data: Vec<u8>) -> Result<(), String> {
    Err("Apple pasteboard binary formats are not supported on Linux; use the file picker or drag and drop instead".to_string())
}

pub fn read_clipboard_binary(_ty: String, _pasteboard: Option<String>) -> Result<Vec<u8>, String> {
    Err("Apple pasteboard binary formats are not supported on Linux; use the file picker or drag and drop instead".to_string())
}

pub fn read_clipboard_strings(
    _types: Vec<String>,
    _pasteboard: Option<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    Err("Apple pasteboard string formats are not supported on Linux; use the file picker or drag and drop instead".to_string())
}

pub fn read_clipboard_types(_pasteboard: Option<String>) -> Result<Vec<String>, String> {
    Err("Apple pasteboard type inspection is not supported on Linux; use the file picker or drag and drop instead".to_string())
}
