use sea_orm::DbErr;

#[derive(Debug)]
pub enum MixedError {
    SeaOrm(DbErr),
    Io(std::io::Error),
    Other(String),
    Sqlx(sqlx::Error),
    Transaction(sea_orm::TransactionError<DbErr>),
}

impl std::fmt::Display for MixedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", mixed_error_to_string(&self))
    }
}

impl From<std::string::String> for MixedError {
    fn from(e: std::string::String) -> Self {
        MixedError::Other(e)
    }
}

impl From<std::io::Error> for MixedError {
    fn from(e: std::io::Error) -> Self {
        MixedError::Io(e)
    }
}

impl From<sqlx::Error> for MixedError {
    fn from(e: sqlx::Error) -> Self {
        MixedError::Sqlx(e)
    }
}

impl From<DbErr> for MixedError {
    fn from(e: DbErr) -> Self {
        MixedError::SeaOrm(e)
    }
}

impl From<sea_orm::TransactionError<DbErr>> for MixedError {
    fn from(e: sea_orm::TransactionError<DbErr>) -> Self {
        MixedError::Transaction(e)
    }
}

fn mixed_error_to_string(error: &MixedError) -> String {
    match error {
        MixedError::Sqlx(e) => e.to_string(),
        MixedError::SeaOrm(e) => e.to_string(),
        MixedError::Io(e) => e.to_string(),
        MixedError::Other(e) => e.to_string(),
        MixedError::Transaction(e) => e.to_string(),
    }
}

impl From<MixedError> for String {
    fn from(err: MixedError) -> String {
        err.to_string()
    }
}
