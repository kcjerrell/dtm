//! Script responder; future Tauri routing supplies the registry independently of Projects.
use super::output::OutputRegistry;
use tauri::http::{header, Method, Request, Response, StatusCode};

/// Blocking IO: async handlers must invoke on a blocking worker. Acquires a lease for
/// the entire read, then returns owned bytes that survive eviction and registry drop.
/// Tokens are bearer capabilities. CORS follows DTM's existing image response convention;
/// no credentials. Cache suppression prevents reuse of revoked URLs from browser cache.
pub fn respond(registry: &OutputRegistry, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let response = |status, media, bytes| {
        let mut response = Response::new(bytes);
        *response.status_mut() = status;
        let headers = response.headers_mut();
        headers.insert(header::CONTENT_TYPE, media);
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_ORIGIN,
            header::HeaderValue::from_static("*"),
        );
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            header::HeaderValue::from_static("GET, HEAD, OPTIONS"),
        );
        headers.insert(
            header::CACHE_CONTROL,
            header::HeaderValue::from_static("no-store"),
        );
        headers.insert(
            header::X_CONTENT_TYPE_OPTIONS,
            header::HeaderValue::from_static("nosniff"),
        );
        response
    };
    let error = |status| {
        response(
            status,
            header::HeaderValue::from_static("text/plain; charset=utf-8"),
            b"Script output unavailable".to_vec(),
        )
    };
    let uri = request.uri();
    let Some(token) = uri.path().strip_prefix('/') else {
        return error(StatusCode::BAD_REQUEST);
    };
    if uri.scheme_str() != Some("dtm")
        || uri.authority().map(|v| v.as_str()) != Some("script-output")
        || uri.query().is_some()
        || token.len() != 64
        || !token
            .bytes()
            .all(|v| v.is_ascii_hexdigit() && !v.is_ascii_uppercase())
    {
        return error(StatusCode::BAD_REQUEST);
    }
    if request.method() == Method::OPTIONS {
        return response(
            StatusCode::NO_CONTENT,
            header::HeaderValue::from_static("text/plain"),
            Vec::new(),
        );
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return error(StatusCode::METHOD_NOT_ALLOWED);
    }
    let Ok(lease) = registry.acquire(token) else {
        return error(StatusCode::NOT_FOUND);
    };
    let media = match lease.metadata().media_type.as_str() {
        "image/png" => header::HeaderValue::from_static("image/png"),
        "image/jpeg" => header::HeaderValue::from_static("image/jpeg"),
        _ => return error(StatusCode::INTERNAL_SERVER_ERROR),
    };
    let bytes = if request.method() == Method::HEAD {
        Vec::new()
    } else {
        let Ok(bytes) = lease.read() else {
            return error(StatusCode::INTERNAL_SERVER_ERROR);
        };
        bytes
    };
    let mut result = response(StatusCode::OK, media, bytes);
    if let Ok(length) = header::HeaderValue::from_str(&lease.metadata().byte_length.to_string()) {
        result.headers_mut().insert(header::CONTENT_LENGTH, length);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::output::{
        tests::{execution, image},
        AuthorizedOutputRoot, OutputLimits,
    };
    use std::{
        fs,
        time::{Duration, Instant},
    };
    fn request(url: &str, method: Method) -> Request<Vec<u8>> {
        Request::builder()
            .uri(url)
            .method(method)
            .body(Vec::new())
            .unwrap()
    }
    #[test]
    fn detected_mime_owned_body_cors_and_head() {
        let run = tempfile::tempdir().unwrap();
        let authorized = AuthorizedOutputRoot::open(run.path()).unwrap();
        let output = run.path().join("output");
        fs::create_dir(&output).unwrap();
        let root = tempfile::tempdir().unwrap();
        let registry = OutputRegistry::new(root.path(), OutputLimits::default()).unwrap();
        for (format, media) in [
            (image::ImageFormat::Jpeg, "image/jpeg"),
            (image::ImageFormat::Png, "image/png"),
        ] {
            let bytes = image(format);
            let path = output.join("result.txt");
            fs::write(&path, &bytes).unwrap();
            let lease = registry.register(&authorized, &execution(path)).unwrap();
            let response = respond(
                &registry,
                &request(&lease.metadata().preview_url, Method::GET),
            );
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(response.headers()[header::CONTENT_TYPE], media);
            assert_eq!(
                response.headers()[header::CONTENT_LENGTH],
                bytes.len().to_string()
            );
            assert_eq!(response.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN], "*");
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
            let head = respond(
                &registry,
                &request(&lease.metadata().preview_url, Method::HEAD),
            );
            assert_eq!(head.status(), StatusCode::OK);
            assert!(head.body().is_empty());
            assert_eq!(
                head.headers()[header::CONTENT_LENGTH],
                bytes.len().to_string()
            );
            assert_eq!(
                respond(
                    &registry,
                    &request(&lease.metadata().preview_url, Method::OPTIONS)
                )
                .status(),
                StatusCode::NO_CONTENT
            );
            assert_eq!(
                respond(
                    &registry,
                    &request(&lease.metadata().preview_url, Method::POST)
                )
                .status(),
                StatusCode::METHOD_NOT_ALLOWED
            );
            registry.clear().unwrap();
            drop(lease);
            assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
            assert_eq!(response.body(), &bytes);
        }
    }
    #[test]
    fn unknown_expired_and_malformed_requests_have_path_free_errors() {
        let run = tempfile::tempdir().unwrap();
        let authorized = AuthorizedOutputRoot::open(run.path()).unwrap();
        let output = run.path().join("output");
        fs::create_dir(&output).unwrap();
        let root = tempfile::tempdir().unwrap();
        let registry = OutputRegistry::new(root.path(), OutputLimits::default()).unwrap();
        let path = output.join("secret.png");
        fs::write(&path, image(image::ImageFormat::Png)).unwrap();
        let lease = registry.register(&authorized, &execution(&path)).unwrap();
        registry
            .expire(Instant::now() + Duration::from_secs(7200))
            .unwrap();
        let expired = respond(
            &registry,
            &request(&lease.metadata().preview_url, Method::GET),
        );
        assert_eq!(expired.status(), StatusCode::NOT_FOUND);
        let urls = [
            format!("dtm://script-output/{}", "f".repeat(64)),
            format!("dtm://script-output/{}", path.display()),
            "dtm://script-output/../secret.png".into(),
            "dtm://script-output/%2e%2e%2fsecret".into(),
            "dtm://other/token".into(),
            format!("{}?path=secret", lease.metadata().preview_url),
        ];
        for url in urls {
            let response = respond(&registry, &request(&url, Method::GET));
            assert!(response.status().is_client_error());
            assert_eq!(response.body(), b"Script output unavailable");
            assert!(!String::from_utf8_lossy(response.body()).contains("secret"));
        }
    }
}
