pub fn get_clipboard(pasteboard: Option<String>) -> Result<Retained<NSPasteboard>, String> {
    unsafe {
        match pasteboard.as_deref() {
            Some("drag") => Ok(NSPasteboard::pasteboardWithName(&*NSPasteboardNameDrag)),
            Some("general") | None => Ok(NSPasteboard::generalPasteboard()),
            Some(other) => return Err(format!("Unknown pasteboard name: {other}")),
        }
    }
}

pub fn write_clipboard_binary(ty: String, data: Vec<u8>) -> Result<(), String> {
    let pb = get_clipboard(None)?; // general pasteboard only
    let ns_type = NSString::from_str(&ty);

    // Convert Vec<u8> into NSData
    let binding = NSData::from_vec(data);
    let ns_data = binding.as_ref();

    unsafe {
        pb.clearContents();
        let ok = pb.setData_forType(Some(ns_data), &ns_type);
        if !ok {
            return Err(format!("Failed to write binary data for {}", ty));
        }
    }

    Ok(())
}

pub fn read_clipboard_binary(ty: String, pasteboard: Option<String>) -> Result<Vec<u8>, String> {
    let pb = get_clipboard(pasteboard)?;
    let ns_type = NSString::from_str(&ty);
    let type_array = NSArray::from_slice(&[&*ns_type]);

    if unsafe { pb.availableTypeFromArray(&*type_array) }.is_none() {
        return Err(format!("Type {} not available", ty));
    }

    let data: Option<Retained<NSData>> = unsafe { pb.dataForType(&*ns_type) };
    let data = data.ok_or_else(|| format!("Failed to read binary data for {}", ty))?;
    let bytes = unsafe { data.as_bytes_unchecked() };

    Ok(bytes.to_vec())
}

pub fn read_clipboard_strings(
    types: Vec<String>,
    pasteboard: Option<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let pb = get_clipboard(pasteboard)?;
    let mut results = std::collections::HashMap::new();

    for ty in types {
        let ns_type = NSString::from_str(&ty);
        let type_array = NSArray::from_slice(&[&*ns_type]);

        // Only proceed if available
        if unsafe { pb.availableTypeFromArray(&*type_array) }.is_none() {
            continue;
        }

        // Try to read as NSString
        if let Some(s) = unsafe { pb.stringForType(&*ns_type) } {
            results.insert(ty, s.to_string());
        }
    }

    Ok(results)
}

pub fn read_clipboard_types(pasteboard: Option<String>) -> Result<Vec<String>, String> {
    // Select pasteboard based on argument
    let pb: Retained<NSPasteboard> = get_clipboard(pasteboard)?;

    // Get available types (NSArray<NSString>)
    let available = unsafe { pb.types() }.ok_or("Failed to get available types")?;

    // Convert NSArray<NSString> → Vec<String>
    let mut result = Vec::with_capacity(available.len());
    for i in 0..available.len() {
        let ty: Retained<NSString> = available.objectAtIndex(i);
        result.push(ty.to_string());
    }

    Ok(result)
}
