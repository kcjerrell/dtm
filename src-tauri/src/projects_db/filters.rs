use entity::{image_controls, image_loras, images};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryTrait};
use serde::{Deserialize, Serialize};

impl ListImagesFilterTarget {
    pub fn apply(
        &self,
        op: ListImagesFilterOperator,
        value: &ListImagesFilterValue,
        q: sea_orm::Select<images::Entity>,
    ) -> sea_orm::Select<images::Entity> {
        match self {
            ListImagesFilterTarget::Type => apply_type_filter(op, value, q),
            ListImagesFilterTarget::Model => apply_model_filter(op, value, q),
            ListImagesFilterTarget::Sampler => apply_sampler_filter(op, value, q),
            ListImagesFilterTarget::Content => apply_content_filter(op, value, q),

            // numeric fallthrough
            ListImagesFilterTarget::Seed
            | ListImagesFilterTarget::Steps
            | ListImagesFilterTarget::Width
            | ListImagesFilterTarget::Height
            | ListImagesFilterTarget::TextGuidance
            | ListImagesFilterTarget::Shift => self.apply_numeric(op, value, q),

            // TODO: Lora / Control are relations — depends on how you want to filter
            ListImagesFilterTarget::Lora => apply_lora_filter(op, value, q),
            ListImagesFilterTarget::Control => apply_control_filter(op, value, q),
        }
    }
}

fn apply_type_filter(
    op: ListImagesFilterOperator,
    value: &ListImagesFilterValue,
    q: sea_orm::Select<images::Entity>,
) -> sea_orm::Select<images::Entity> {
    use sea_orm::QueryFilter;
    use ListImagesFilterOperator::*;

    let types = match value {
        ListImagesFilterValue::String(v) => v,
        _ => return q,
    };
    println!("types: {:?}", types);
    // types will have "Image" or "Video" or both
    // op image video
    // is true false        isnot false true         images only
    // is false true        isnot true false         videos only
    // is true true         isnot false false        both
    // is false false       isnot true true          none
    // so just boil it down to has images and has videos
    let op_is_is = matches!(op, Is);
    let mut has_images = !op_is_is;
    let mut has_videos = !op_is_is;

    for t in types {
        match t.as_str() {
            "image" => has_images = op_is_is,
            "video" => has_videos = op_is_is,
            _ => {}
        }
    }
    println!("has_images: {}, has_videos: {}, is_is: {}", has_images, has_videos, op_is_is);

    if has_images && has_videos {
        return q;
    }
    if has_images {
        return q.filter(images::Column::NumFrames.is_null());
    }
    if has_videos {
        return q.filter(images::Column::NumFrames.is_not_null());
    }

    // this is pointless but accurate
    q.filter(sea_query::Expr::val(false))
}

fn apply_model_filter(
    op: ListImagesFilterOperator,
    value: &ListImagesFilterValue,
    q: sea_orm::Select<images::Entity>,
) -> sea_orm::Select<images::Entity> {
    use sea_orm::QueryFilter;
    use ListImagesFilterOperator::*;

    let nums = match value {
        ListImagesFilterValue::Number(v) => v,
        _ => return q,
    };

    let ids: Vec<i64> = nums.iter().map(|n| *n as i64).collect();

    match op {
        Is => q.filter(images::Column::ModelId.is_in(ids)),
        IsNot => q.filter(images::Column::ModelId.is_not_in(ids)),
        _ => q,
    }
}

fn apply_sampler_filter(
    op: ListImagesFilterOperator,
    value: &ListImagesFilterValue,
    q: sea_orm::Select<images::Entity>,
) -> sea_orm::Select<images::Entity> {
    use sea_orm::QueryFilter;
    use ListImagesFilterOperator::*;

    let nums = match value {
        ListImagesFilterValue::Number(v) => v,
        _ => return q,
    };

    let ids: Vec<i8> = nums.iter().map(|n| *n as i8).collect();

    match op {
        Is => q.filter(images::Column::Sampler.is_in(ids)),
        IsNot => q.filter(images::Column::Sampler.is_not_in(ids)),
        _ => q,
    }
}

impl NumericFilter for ListImagesFilterTarget {
    fn col(&self) -> images::Column {
        match self {
            ListImagesFilterTarget::Seed => images::Column::Seed,
            ListImagesFilterTarget::Steps => images::Column::Steps,
            ListImagesFilterTarget::Width => images::Column::StartWidth,
            ListImagesFilterTarget::Height => images::Column::StartHeight,
            ListImagesFilterTarget::TextGuidance => images::Column::GuidanceScale,
            ListImagesFilterTarget::Shift => images::Column::Shift,
            _ => unreachable!("Target is not numeric"),
        }
    }
}

trait NumericFilter {
    fn col(&self) -> images::Column;

    fn apply_numeric(
        &self,
        op: ListImagesFilterOperator,
        value: &ListImagesFilterValue,
        q: sea_orm::Select<images::Entity>,
    ) -> sea_orm::Select<images::Entity> {
        let nums = match value {
            ListImagesFilterValue::Number(n) => n,
            _ => return q,
        };

        if nums.len() != 1 {
            return q;
        }

        let n = nums[0];

        use ListImagesFilterOperator::*;
        match op {
            Eq => q.filter(self.col().eq(n)),
            Neq => q.filter(self.col().ne(n)),
            Gt => q.filter(self.col().gt(n)),
            Gte => q.filter(self.col().gte(n)),
            Lt => q.filter(self.col().lt(n)),
            Lte => q.filter(self.col().lte(n)),
            _ => q,
        }
    }
}

fn apply_lora_filter(
    op: ListImagesFilterOperator,
    value: &ListImagesFilterValue,
    q: sea_orm::Select<images::Entity>,
) -> sea_orm::Select<images::Entity> {
    use sea_orm::{QueryFilter, QuerySelect};
    use ListImagesFilterOperator::*;

    let nums = match value {
        ListImagesFilterValue::Number(v) => v,
        _ => return q,
    };

    let ids: Vec<i64> = nums.iter().map(|n| *n as i64).collect();

    let subquery = image_loras::Entity::find()
        .select_only()
        .column(image_loras::Column::ImageId)
        .filter(image_loras::Column::LoraId.is_in(ids))
        .into_query();

    match op {
        Is => q.filter(images::Column::Id.in_subquery(subquery)),
        IsNot => q.filter(images::Column::Id.not_in_subquery(subquery)),
        _ => q,
    }
}

fn apply_control_filter(
    op: ListImagesFilterOperator,
    value: &ListImagesFilterValue,
    q: sea_orm::Select<images::Entity>,
) -> sea_orm::Select<images::Entity> {
    use sea_orm::{QueryFilter, QuerySelect};
    use ListImagesFilterOperator::*;

    let nums = match value {
        ListImagesFilterValue::Number(v) => v,
        _ => return q,
    };

    let ids: Vec<i64> = nums.iter().map(|n| *n as i64).collect();

    let subquery = image_controls::Entity::find()
        .select_only()
        .column(image_controls::Column::ImageId)
        .filter(image_controls::Column::ControlId.is_in(ids))
        .into_query();

    match op {
        Is => q.filter(images::Column::Id.in_subquery(subquery)),
        IsNot => q.filter(images::Column::Id.not_in_subquery(subquery)),
        _ => q,
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ListImagesFilter {
    pub target: ListImagesFilterTarget,
    pub operator: ListImagesFilterOperator,
    pub value: ListImagesFilterValue,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ListImagesFilterTarget {
    Model,
    Lora,
    Control,
    Sampler,
    Content,
    Seed,
    Steps,
    Width,
    Height,
    TextGuidance,
    Shift,
    Type,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ListImagesFilterOperator {
    Eq,
    Neq,
    Gt,
    Gte,
    Lt,
    Lte,
    Is,
    IsNot,
    Has,
    HasAll,
    DoesNotHave,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum ListImagesFilterValue {
    String(Vec<String>),
    Number(Vec<f64>),
}

fn apply_content_filter(
    op: ListImagesFilterOperator,
    value: &ListImagesFilterValue,
    mut q: sea_orm::Select<images::Entity>,
) -> sea_orm::Select<images::Entity> {
    use sea_orm::QueryFilter;
    use ListImagesFilterOperator::*;

    let strings = match value {
        ListImagesFilterValue::String(v) => v,
        _ => return q,
    };

    if strings.is_empty() {
        return q;
    }

    match op {
        HasAll => {
            for s in strings {
                match s.as_str() {
                    "mask" => q = q.filter(images::Column::HasMask.eq(true)),
                    "depth" => q = q.filter(images::Column::HasDepth.eq(true)),
                    "pose" => q = q.filter(images::Column::HasPose.eq(true)),
                    "color" => q = q.filter(images::Column::HasColor.eq(true)),
                    "custom" => q = q.filter(images::Column::HasCustom.eq(true)),
                    "scribble" => q = q.filter(images::Column::HasScribble.eq(true)),
                    "shuffle" | "moodboard" => q = q.filter(images::Column::HasShuffle.eq(true)),
                    _ => {}
                }
            }
            q
        }
        Has => {
            let mut cond = sea_orm::Condition::any();
            for s in strings {
                match s.as_str() {
                    "mask" => cond = cond.add(images::Column::HasMask.eq(true)),
                    "depth" => cond = cond.add(images::Column::HasDepth.eq(true)),
                    "pose" => cond = cond.add(images::Column::HasPose.eq(true)),
                    "color" => cond = cond.add(images::Column::HasColor.eq(true)),
                    "custom" => cond = cond.add(images::Column::HasCustom.eq(true)),
                    "scribble" => cond = cond.add(images::Column::HasScribble.eq(true)),
                    "shuffle" | "moodboard" => cond = cond.add(images::Column::HasShuffle.eq(true)),
                    _ => {}
                }
            }
            q.filter(cond)
        }
        DoesNotHave => {
            for s in strings {
                match s.as_str() {
                    "mask" => q = q.filter(images::Column::HasMask.eq(false)),
                    "depth" => q = q.filter(images::Column::HasDepth.eq(false)),
                    "pose" => q = q.filter(images::Column::HasPose.eq(false)),
                    "color" => q = q.filter(images::Column::HasColor.eq(false)),
                    "custom" => q = q.filter(images::Column::HasCustom.eq(false)),
                    "scribble" => q = q.filter(images::Column::HasScribble.eq(false)),
                    "shuffle" | "moodboard" => q = q.filter(images::Column::HasShuffle.eq(false)),
                    _ => {}
                }
            }
            q
        }
        _ => q,
    }
}
