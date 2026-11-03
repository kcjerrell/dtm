//! Maps a Bun entry-file position through the analyzer's single-source v3 map.
use std::path::Path;

use serde::Deserialize;

use super::{
    executor::{ExecutionFailure, ExecutionFailurePhase},
    types::{SourceLocation, SourcePosition, SourceRange, SourceSnapshot},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzerMap {
    version: u32,
    file: String,
    sources: Vec<String>,
    sources_content: Vec<String>,
    mappings: String,
}

pub(super) fn original_location(
    entry: &Path,
    snapshot: &SourceSnapshot,
    failure: &ExecutionFailure,
) -> Option<SourceLocation> {
    if failure.phase == ExecutionFailurePhase::Runner {
        return None;
    }
    let location = failure.location.as_ref()?;
    if Path::new(&location.file) != entry {
        return None;
    }
    let line = location.line.checked_sub(1)?;
    let column = location.column.checked_sub(1)?;
    // Bun and the analyzer both count UTF-16 code units.
    position(&snapshot.instrumented_source, line, column)?;
    let map: AnalyzerMap = serde_json::from_str(snapshot.source_map.as_deref()?).ok()?;
    if map.version != 3
        || map.file.is_empty()
        || map.sources != [map.file.as_str()]
        || map.sources_content != [snapshot.source.as_str()]
    {
        return None;
    }
    let (original_line, original_column) = original_coordinates(&map.mappings, line, column)?;
    let (start, width) = position(&snapshot.source, original_line, original_column)?;
    let end = SourcePosition {
        line: start.line,
        column: start.column.checked_add(width)?,
        offset: start.offset.checked_add(width)?,
    };
    Some(SourceLocation {
        file: map.file,
        range: SourceRange { start, end },
    })
}

// The analyzer emits a mapping for every generated code unit. A gap or an
// unmapped segment has no location. Only the first (and sole) source is valid.
fn original_coordinates(mappings: &str, line: u32, column: u32) -> Option<(u32, u32)> {
    let (mut source, mut original_line, mut original_column) = (0u32, 0u32, 0u32);
    for (index, segments) in mappings.split(';').enumerate() {
        let target_line = index == line as usize;
        let mut generated_column = 0u32;
        for (segment_index, segment) in segments.split_terminator(',').enumerate() {
            let mut digits = segment.bytes();
            let delta = u32::try_from(vlq(&mut digits)?).ok()?;
            if segment_index > 0 && delta == 0 {
                return None;
            }
            generated_column = generated_column.checked_add(delta)?;
            if target_line && generated_column > column {
                return None;
            }
            if digits.len() == 0 {
                if target_line && generated_column == column {
                    return None;
                }
                continue;
            }
            source = source.checked_add_signed(vlq(&mut digits)?)?;
            original_line = original_line.checked_add_signed(vlq(&mut digits)?)?;
            original_column = original_column.checked_add_signed(vlq(&mut digits)?)?;
            if source != 0 || digits.len() != 0 {
                return None;
            }
            if target_line && generated_column == column {
                return Some((original_line, original_column));
            }
        }
        if target_line {
            return None;
        }
    }
    None
}

fn vlq(digits: &mut impl Iterator<Item = u8>) -> Option<i32> {
    let mut value = 0u64;
    // Seven base64 digits are sufficient for the sign and all 32 value bits.
    for shift in (0..35).step_by(5) {
        let digit = match digits.next()? {
            b @ b'A'..=b'Z' => b - b'A',
            b @ b'a'..=b'z' => b - b'a' + 26,
            b @ b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        };
        value |= u64::from(digit & 31) << shift;
        if digit & 32 == 0 {
            let magnitude = i32::try_from(value >> 1).ok()?;
            return Some(if value & 1 == 0 {
                magnitude
            } else {
                -magnitude
            });
        }
    }
    None
}

fn position(source: &str, line: u32, column: u32) -> Option<(SourcePosition, u32)> {
    let mut units = source.encode_utf16().peekable();
    let (mut current_line, mut current_column, mut offset) = (0u32, 0u32, 0u32);
    loop {
        let unit = units.next();
        let line_end = unit == Some(u16::from(b'\n'))
            || (unit == Some(u16::from(b'\r')) && units.peek() != Some(&u16::from(b'\n')));
        if current_line == line && current_column == column {
            let width = match unit {
                None => 0,
                Some(unit) if line_end || unit == u16::from(b'\r') => 0,
                Some(0xD800..=0xDBFF) => 2,
                Some(0xDC00..=0xDFFF) => return None,
                Some(_) => 1,
            };
            return Some((
                SourcePosition {
                    line: line.checked_add(1)?,
                    column: column.checked_add(1)?,
                    offset,
                },
                width,
            ));
        }
        unit?;
        if line_end {
            if current_line == line {
                return None;
            }
            current_line = current_line.checked_add(1)?;
            current_column = 0;
        } else {
            current_column = current_column.checked_add(1)?;
        }
        offset = offset.checked_add(1)?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::{executor::ExecutionLocation, types::SourceRevision};
    use serde_json::json;

    #[test]
    fn maps_shifted_utf16_columns_and_crlf_offsets_to_the_editor() {
        let source = "a\r\n😀!x";
        let mut snapshot = SourceSnapshot {
            source_revision: SourceRevision(2),
            content_hash: String::new(),
            source: source.into(),
            instrumented_source: "a\r\n😀++!x".into(),
            source_map: Some(
                json!({
                    "version": 3,
                    "file": "file:///virtual/process.ts",
                    "sources": ["file:///virtual/process.ts"],
                    "sourcesContent": [source],
                    // First two columns on line two are the surrogate pair. The
                    // inserted ++ and the following ! share the original offset.
                    "mappings": "AAAA,CAAC;AACD,CAAC,CAAC,CAAA,CAAA,CAAC"
                })
                .to_string(),
            ),
        };
        let entry = Path::new("/run/process.ts");
        let mut failure = ExecutionFailure {
            phase: ExecutionFailurePhase::UserRuntime,
            message: "failed".into(),
            stack: None,
            location: Some(ExecutionLocation {
                file: "/run/process.ts".into(),
                line: 2,
                column: 5,
            }),
        };
        let mapped = original_location(entry, &snapshot, &failure).unwrap();
        assert_eq!(mapped.file, "file:///virtual/process.ts");
        assert_eq!(
            mapped.range.start,
            SourcePosition {
                line: 2,
                column: 3,
                offset: 5
            }
        );
        assert_eq!(
            mapped.range.end,
            SourcePosition {
                line: 2,
                column: 4,
                offset: 6
            }
        );

        failure.location.as_mut().unwrap().file = "/package/process.ts".into();
        assert!(original_location(entry, &snapshot, &failure).is_none());
        failure.location.as_mut().unwrap().file = "/run/process.ts".into();
        failure.location.as_mut().unwrap().column = 40;
        assert!(original_location(entry, &snapshot, &failure).is_none());
        failure.location.as_mut().unwrap().column = 5;
        snapshot.source = "different snapshot".into();
        assert!(original_location(entry, &snapshot, &failure).is_none());
    }

    #[test]
    fn leaves_unmapped_and_invalid_segments_without_a_location() {
        assert_eq!(original_coordinates("AAAA,C,CAAC", 0, 1), None);
        assert_eq!(original_coordinates("AAAA,EAAC", 0, 1), None);
        assert_eq!(original_coordinates("AAAA,CAAD", 0, 1), None);
        assert_eq!(original_coordinates("AAAA,CCAC", 0, 1), None);
        assert_eq!(original_coordinates("AAAA,CAAC!", 0, 1), None);
        assert_eq!(original_coordinates("////////A", 0, 0), None);
    }
}
