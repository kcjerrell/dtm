const UNSUPPORTED: &str = "Apple pasteboard binary formats are not supported on Linux; use file open, drag and drop, or the standard text/image clipboard";

pub fn write_clipboard_binary(_ty: String, _data: Vec<u8>) -> Result<(), String> {
    Err(UNSUPPORTED.to_string())
}

pub fn read_clipboard_binary(_ty: String, _pasteboard: Option<String>) -> Result<Vec<u8>, String> {
    Err(UNSUPPORTED.to_string())
}

pub fn read_clipboard_strings(
    _types: Vec<String>,
    _pasteboard: Option<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    Err(UNSUPPORTED.to_string())
}

pub fn read_clipboard_types(_pasteboard: Option<String>) -> Result<Vec<String>, String> {
    Err(UNSUPPORTED.to_string())
}
