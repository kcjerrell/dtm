use entity::images;
use sea_orm::{Iden, Identity, JoinType, QuerySelect, Select};
use sea_query::{Alias, Expr, IntoIden};

pub fn add_search(query: Select<images::Entity>, text: &str) -> Select<images::Entity> {
    

    query
}
