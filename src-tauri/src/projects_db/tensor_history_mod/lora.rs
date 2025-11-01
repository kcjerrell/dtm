use crate::projects_db::tensor_history_generated::{LoRA as LoRAFb, LoRAMode};
use flatbuffers::{ForwardsUOffset, Vector};
use serde::ser::SerializeStruct;

#[derive(Debug)]
pub struct LoRA {
    pub file: Option<String>,
    pub weight: f32,
    pub mode: LoRAMode,
}

impl serde::Serialize for LoRA {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        // we serialize 3 fields: file, weight, mode
        let mut state = serializer.serialize_struct("LoRA", 3)?;
        state.serialize_field("file", &self.file)?;
        state.serialize_field("weight", &self.weight)?;
        // FlatBuffers-generated enums may not implement serde::Serialize,
        // so serialize their Debug string representation instead.
        state.serialize_field("mode", &format!("{:?}", self.mode))?;
        state.end()
    }
}

impl LoRA {
    pub fn from_fb(
        bytes: Vector<'_, ForwardsUOffset<LoRAFb<'_>>>,
    ) -> Result<Vec<Self>, flatbuffers::InvalidFlatbuffer> {
        let lora_fbs = bytes;
        let mut loras = Vec::with_capacity(lora_fbs.len());
        for lora in lora_fbs {
            loras.push(LoRA {
                weight: lora.weight(),
                file: lora.file().map(|s| s.to_string()),
                mode: lora.mode(),
            });
        }
        Ok(loras)
    }
}
