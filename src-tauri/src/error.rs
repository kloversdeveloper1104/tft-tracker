//! Application error type shared by every command.
//!
//! Serialized to the frontend as `{ "message": string, "code": string, "status"?: number }`
//! which `src/lib/api.ts` turns into an `ApiError`.

use serde::ser::{Serialize, SerializeStruct, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// Riot API responded with an error status.
    #[error("{message}")]
    Riot { status: u16, message: String },
    /// Riot API rate limit hit and retries exhausted.
    #[error("レート制限に達しました。{retry_after}秒後に再試行してください")]
    RateLimited { retry_after: u64 },
    /// `configure_riot` has not been called yet.
    #[error("Riot APIキーが設定されていません。設定画面でAPIキーを入力してください")]
    NotConfigured,
    #[error("通信エラー: {0}")]
    Http(String),
    #[error("データベースエラー: {0}")]
    Db(String),
    #[error("ファイル入出力エラー: {0}")]
    Io(String),
    #[error("JSONエラー: {0}")]
    Json(String),
    #[error("{0}")]
    NotFound(String),
    #[error("キャンセルされました")]
    Cancelled,
    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Riot { .. } => "riot",
            AppError::RateLimited { .. } => "rate_limited",
            AppError::NotConfigured => "not_configured",
            AppError::Http(_) => "http",
            AppError::Db(_) => "db",
            AppError::Io(_) => "io",
            AppError::Json(_) => "json",
            AppError::NotFound(_) => "not_found",
            AppError::Cancelled => "cancelled",
            AppError::Other(_) => "other",
        }
    }

    pub fn status(&self) -> Option<u16> {
        match self {
            AppError::Riot { status, .. } => Some(*status),
            AppError::RateLimited { .. } => Some(429),
            AppError::NotFound(_) => Some(404),
            _ => None,
        }
    }

    pub fn other(msg: impl Into<String>) -> Self {
        AppError::Other(msg.into())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let status = self.status();
        let mut st = serializer.serialize_struct("AppError", if status.is_some() { 3 } else { 2 })?;
        st.serialize_field("message", &self.to_string())?;
        st.serialize_field("code", self.code())?;
        if let Some(s) = status {
            st.serialize_field("status", &s)?;
        }
        st.end()
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Http(e.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Json(e.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Other(e.to_string())
    }
}

impl From<tokio::task::JoinError> for AppError {
    fn from(e: tokio::task::JoinError) -> Self {
        AppError::Other(format!("background task failed: {e}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;
