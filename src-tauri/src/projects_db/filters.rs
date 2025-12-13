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
            ListImagesFilterTarget::Model => apply_model_filter(op, value, q),
            ListImagesFilterTarget::Sampler => apply_sampler_filter(op, value, q),
            // ListImagesFilterTarget::Content => apply_content_filter(op, value, q),
            ListImagesFilterTarget::Content => q,

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
        mut q: sea_orm::Select<images::Entity>,
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
    DoesNotHave,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum ListImagesFilterValue {
    String(Vec<String>),
    Number(Vec<f64>),
}
