pub fn write_clipboard_binary(_ty: String, _data: Vec<u8>) -> anyhow::Result<()> {
    Ok(())
}

pub fn read_clipboard_binary(_ty: String, _pasteboard: Option<String>) -> anyhow::Result<Vec<u8>> {
    Ok(Vec::new())
}

pub fn read_clipboard_strings(
    _types: Vec<String>,
    _pasteboard: Option<String>,
) -> anyhow::Result<std::collections::HashMap<String, String>> {
    Ok(std::collections::HashMap::new())
}

pub fn read_clipboard_types(_pasteboard: Option<String>) -> anyhow::Result<Vec<String>> {
    Ok(Vec::new())
}
