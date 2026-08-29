// all credit to https://github.com/TDiblik/anyhow-tauri

use serde::Serialize;

// Just extending the `anyhow::Error`
#[derive(Debug)]
pub struct TACommandError(pub anyhow::Error);
impl std::error::Error for TACommandError {}
impl std::fmt::Display for TACommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:#}", self.0)
    }
}

// Every "respose" from a tauri command needs to be serializeable into json with serde.
// This is why we cannot use `anyhow` directly. This piece of code fixes that.
impl Serialize for TACommandError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&format!("{:#}", self.0))
    }
}

// Ability to convert between `anyhow::Error` and `TACommandError`
impl From<anyhow::Error> for TACommandError {
    fn from(error: anyhow::Error) -> Self {
        Self(error)
    }
}

/// Use this as your command's return type.
///
/// Example usage:
/// ```
/// #[tauri::command]
/// fn test() -> anyhow_tauri::TAResult<String> {
///     Ok("No error thrown.".into())
/// }
/// ```
///
/// You can find more examples inside the library's repo at `/demo/src-tauri/src/main.rs`
pub type TAResult<T> = std::result::Result<T, TACommandError>;

pub trait IntoTAResult<T> {
    fn into_ta_result(self) -> TAResult<T>;
}

impl<T, E> IntoTAResult<T> for std::result::Result<T, E>
where
    E: Into<anyhow::Error>,
{
    /// Maps errors, which can be converted into `anyhow`'s error type, into `TACommandError` which can be returned from command call.
    /// This is a "quality of life" improvement.
    ///
    /// Example usage:
    /// ```
    /// #[tauri::command]
    /// fn test_into_ta_result() -> anyhow_tauri::TAResult<String> {
    ///     function_that_succeeds().into_ta_result()
    ///     // could also be written as:
    ///     // Ok(function_that_succeeds()?)
    /// }
    /// ```
    fn into_ta_result(self) -> TAResult<T> {
        self.map_err(|e| TACommandError(e.into()))
    }
}
impl<T> IntoTAResult<T> for anyhow::Error {
    /// Maps `anyhow`'s error type into `TACommandError` which can be returned from a command call.
    /// This is a "quality of life" improvement.
    ///
    /// Example usage:
    /// ```
    /// #[tauri::command]
    /// fn test_into_ta_result() -> anyhow_tauri::TAResult<String> {
    ///     function_that_succeeds().into_ta_result()
    ///     // could also be written as:
    ///     // Ok(function_that_succeeds()?)
    /// }
    /// ```
    fn into_ta_result(self) -> TAResult<T> {
        Err(TACommandError(self))
    }
}

pub trait IntoEmptyTAResult<T> {
    /// Usefull whenever you want to create `Result<(), TACommandError>` (or `TAResult<()>`)
    ///
    /// Example usage:
    /// ```
    /// #[tauri::command]
    /// fn test_into_ta_empty_result() -> anyhow_tauri::TAResult<()> {
    ///     anyhow::anyhow!("Showcase of the .into_ta_empty_result()").into_ta_empty_result()
    /// }
    /// ```
    fn into_ta_empty_result(self) -> TAResult<T>;
}
impl IntoEmptyTAResult<()> for anyhow::Error {
    fn into_ta_empty_result(self) -> TAResult<()> {
        Err(TACommandError(self))
    }
}

/// Mirrors the `anyhow::bail!` implementation, but calls `.into_ta_result()` afterwards.
///
/// Example usage:
/// ```
/// #[tauri::command]
/// fn test_bail() -> anyhow_tauri::TAResult<String> {
///     anyhow_tauri::bail!("Showcase of the .bail!()")
/// }
/// ```
#[macro_export]
macro_rules! bail {
    ($msg:literal $(,)?) => {
        return Err(anyhow::anyhow!($msg)).into_ta_result()
    };
    ($err:expr $(,)?) => {
        return Err(anyhow::anyhow!($err)).into_ta_result()
    };
    ($fmt:expr, $($arg:tt)*) => {
        return Err(anyhow::anyhow!($fmt, $($arg)*)).into_ta_result()
    };
}

/// Mirrors the `anyhow::ensure!` implementation, but calls `.into_ta_result()` afterwards.
///
/// Example usage:
/// ```
/// #[tauri::command]
/// fn test_ensure() -> anyhow_tauri::TAResult<String> {
///     anyhow_tauri::ensure!(1 == 2); // this should throw
///     Ok("this should never trigger".to_owned())
/// }
/// ```
#[macro_export]
macro_rules! ensure {
    ($cond:expr $(,)?) => {
        if !$cond {
            return Err(anyhow::anyhow!(concat!(
                "Condition failed: `",
                stringify!($cond),
                "`"
            ))).into_ta_result();
        }
    };
    ($cond:expr, $msg:literal $(,)?) => {
        if !$cond {
            return Err(anyhow::anyhow!($msg)).into_ta_result()
        }
    };
    ($cond:expr, $err:expr $(,)?) => {
        if !$cond {
            return Err(anyhow::anyhow!($err)).into_ta_result()
        }
    };
    ($cond:expr, $fmt:expr, $($arg:tt)*) => {
        if !$cond {
            return Err(anyhow::anyhow!($fmt, $($arg)*)).into_ta_result()
        }
    };
}
