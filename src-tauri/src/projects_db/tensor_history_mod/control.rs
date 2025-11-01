use crate::projects_db::tensor_history_generated::{
    Control as ControlFb, ControlInputType, ControlMode,
};
use flatbuffers::{ForwardsUOffset, Vector};
use serde::ser::SerializeStruct;

#[derive(Debug)]
pub struct Control {
    pub file: Option<String>,
    pub weight: f32,
    pub guidance_start: f32,
    pub guidance_end: f32,
    pub no_prompt: bool,
    pub global_average_pooling: bool,
    pub down_sampling_rate: f32,
    pub control_mode: ControlMode,
    pub target_blocks: Option<Vec<String>>,
    pub input_override: ControlInputType,
}

impl serde::Serialize for Control {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        // we serialize 10 fields: file, weight, guidance_start, guidance_end,
        // no_prompt, global_average_pooling, down_sampling_rate, control_mode,
        // target_blocks, input_override
        let mut state = serializer.serialize_struct("Control", 10)?;
        state.serialize_field("file", &self.file)?;
        state.serialize_field("weight", &self.weight)?;
        state.serialize_field("guidance_start", &self.guidance_start)?;
        state.serialize_field("guidance_end", &self.guidance_end)?;
        state.serialize_field("no_prompt", &self.no_prompt)?;
        state.serialize_field("global_average_pooling", &self.global_average_pooling)?;
        state.serialize_field("down_sampling_rate", &self.down_sampling_rate)?;
        // FlatBuffers-generated enums/union types may not implement serde::Serialize,
        // serialize their Debug string representation instead of casting to a primitive.
        state.serialize_field("control_mode", &format!("{:?}", self.control_mode))?;
        state.serialize_field("target_blocks", &self.target_blocks)?;
        state.serialize_field("input_override", &format!("{:?}", self.input_override))?;
        state.end()
    }
}

impl Control {
    pub fn from_fb(
        bytes: Vector<'_, ForwardsUOffset<ControlFb<'_>>>,
    ) -> Result<Vec<Self>, flatbuffers::InvalidFlatbuffer> {
        let control_fbs = bytes;
        let mut controls = Vec::with_capacity(control_fbs.len());
        for control in control_fbs {
            controls.push(Control {
                file: control.file().map(|s| s.to_string()),
                weight: control.weight(),
                guidance_start: control.guidance_start(),
                guidance_end: control.guidance_end(),
                no_prompt: control.no_prompt(),
                global_average_pooling: control.global_average_pooling(),
                down_sampling_rate: control.down_sampling_rate(),
                control_mode: control.control_mode(),
                target_blocks: Some(
                    control
                        .target_blocks()
                        .unwrap()
                        .iter()
                        .map(|tb| tb.to_string())
                        .collect(),
                ),
                input_override: control.input_override(),
            });
        }
        Ok(controls)
    }
}
