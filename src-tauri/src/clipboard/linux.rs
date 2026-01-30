
pub fn write_clipboard_binary(_ty: String, _data: Vec<u8>) -> Result<(), String> {
    Ok(())
}

pub fn read_clipboard_binary(_ty: String, _pasteboard: Option<String>) -> Result<Vec<u8>, String> {
    Ok(Vec::new())
}

pub fn read_clipboard_strings(
    _types: Vec<String>,
    _pasteboard: Option<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    Ok(std::collections::HashMap::new())
}

pub fn read_clipboard_types(_pasteboard: Option<String>) -> Result<Vec<String>, String> {
    Ok(Vec::new())
}
