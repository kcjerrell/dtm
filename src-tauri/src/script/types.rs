use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const PROJECT_MANIFEST_SCHEMA_VERSION: u32 = 1;
pub const RUN_MANIFEST_SCHEMA_VERSION: u32 = 1;

macro_rules! string_id {
    ($name:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub String);
    };
}

macro_rules! revision {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub u64);
    };
}

string_id!(ProjectId);
string_id!(RunId);
string_id!(ClientRequestId);
revision!(SourceRevision);
revision!(ValueRevision);
revision!(InputRevision);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub project_id: ProjectId,
    pub display_name: String,
    pub entry_file: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourcePosition {
    pub line: u32,
    pub column: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceRange {
    pub start: SourcePosition,
    pub end: SourcePosition,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticSource {
    #[serde(rename = "typescript")]
    TypeScript,
    Analyzer,
    Bun,
    UserRuntime,
    Runner,
    OutputValidation,
    Timeout,
    Cancellation,
    Dependency,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceLocation {
    pub file: String,
    pub range: SourceRange,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptDiagnostic {
    pub source: DiagnosticSource,
    pub severity: DiagnosticSeverity,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<SourceLocation>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum GeneratedControl {
    Image {
        id: String,
        label: String,
        source_range: SourceRange,
        required: bool,
    },
    Number {
        id: String,
        label: String,
        source_range: SourceRange,
        default_value: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        min: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        max: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        step: Option<f64>,
    },
    Slider {
        id: String,
        label: String,
        source_range: SourceRange,
        default_value: f64,
        min: f64,
        max: f64,
        step: f64,
    },
    Boolean {
        id: String,
        label: String,
        source_range: SourceRange,
        default_value: bool,
    },
    Text {
        id: String,
        label: String,
        source_range: SourceRange,
        default_value: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum ControlValue {
    Number { value: f64 },
    Boolean { value: bool },
    Text { value: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SelectedInput {
    LocalFile {
        input_id: String,
        display_name: String,
        selection_token: String,
    },
    DrawThings {
        input_id: String,
        display_name: String,
        resource_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterializedInput {
    pub input_id: String,
    pub file_name: String,
    pub media_type: String,
    pub byte_length: u64,
    pub content_hash: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceSnapshot {
    pub source_revision: SourceRevision,
    pub content_hash: String,
    pub source: String,
    pub instrumented_source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_map: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunIdentity {
    pub project_id: ProjectId,
    pub run_id: RunId,
    pub client_request_id: ClientRequestId,
    pub source_revision: SourceRevision,
    pub value_revision: ValueRevision,
    pub input_revision: InputRevision,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunRequest {
    pub project_id: ProjectId,
    pub client_request_id: ClientRequestId,
    pub source: SourceSnapshot,
    pub value_revision: ValueRevision,
    pub input_revision: InputRevision,
    pub values: BTreeMap<String, ControlValue>,
    pub inputs: Vec<SelectedInput>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunManifest {
    pub schema_version: u32,
    pub identity: RunIdentity,
    pub source: SourceSnapshot,
    pub values: BTreeMap<String, ControlValue>,
    pub inputs: Vec<MaterializedInput>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutputMetadata {
    pub preview_url: String,
    pub media_type: String,
    pub byte_length: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LogStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CancellationReason {
    Superseded,
    User,
    Shutdown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ScriptRunEvent {
    Queued {
        identity: RunIdentity,
    },
    Started {
        identity: RunIdentity,
        started_at: String,
    },
    Log {
        identity: RunIdentity,
        stream: LogStream,
        message: String,
    },
    Diagnostic {
        identity: RunIdentity,
        diagnostic: ScriptDiagnostic,
    },
    Succeeded {
        identity: RunIdentity,
        output: OutputMetadata,
    },
    Failed {
        identity: RunIdentity,
        diagnostic: ScriptDiagnostic,
    },
    Cancelled {
        identity: RunIdentity,
        reason: CancellationReason,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct ContractFixtures {
        project_manifest: ProjectManifest,
        controls: Vec<GeneratedControl>,
        values: Vec<ControlValue>,
        selected_inputs: Vec<SelectedInput>,
        materialized_inputs: Vec<MaterializedInput>,
        diagnostics: Vec<ScriptDiagnostic>,
        run_request: RunRequest,
        run_manifest: RunManifest,
        outputs: Vec<OutputMetadata>,
        events: Vec<ScriptRunEvent>,
    }

    fn fixture_json() -> Value {
        serde_json::from_str(include_str!(
            "../../../src/script/contracts/fixtures/contracts.json"
        ))
        .expect("shared contract fixture must be valid JSON")
    }

    #[test]
    fn shared_fixture_round_trips_exactly() {
        let json = fixture_json();
        let fixtures: ContractFixtures =
            serde_json::from_value(json.clone()).expect("fixture must match Rust contracts");

        assert_eq!(serde_json::to_value(fixtures).unwrap(), json);
    }

    #[test]
    fn rejects_unknown_event_and_control_tags() {
        assert!(serde_json::from_value::<ScriptRunEvent>(json!({
            "type": "futureEvent",
            "identity": {}
        }))
        .is_err());
        assert!(serde_json::from_value::<GeneratedControl>(json!({
            "type": "futureControl",
            "id": "future"
        }))
        .is_err());
    }

    #[test]
    fn rejects_missing_required_fields() {
        let event = fixture_json()["events"][0].clone();
        let mut malformed = event.as_object().unwrap().clone();
        malformed.remove("identity");

        assert!(serde_json::from_value::<ScriptRunEvent>(Value::Object(malformed)).is_err());
        assert!(serde_json::from_value::<ProjectManifest>(json!({
            "schemaVersion": PROJECT_MANIFEST_SCHEMA_VERSION,
            "projectId": "project-1",
            "displayName": "Missing entry file"
        }))
        .is_err());
    }

    #[test]
    fn schema_version_constants_match_the_fixture() {
        let fixture = fixture_json();
        assert_eq!(
            fixture["projectManifest"]["schemaVersion"],
            PROJECT_MANIFEST_SCHEMA_VERSION
        );
        assert_eq!(
            fixture["runManifest"]["schemaVersion"],
            RUN_MANIFEST_SCHEMA_VERSION
        );
    }
}
