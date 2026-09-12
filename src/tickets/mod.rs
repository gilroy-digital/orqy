//! Support tickets.
//!
//! The floating ticket button in the UI posts here rather than straight to
//! the ticket API. Going through the backend means the reporter address is
//! taken from the session instead of the request body — a signed-in user can
//! only ever raise a ticket as themselves — and it keeps the business ref out
//! of the JavaScript bundle.
//!
//! Only ticket creation is proxied. Creation uses the public_ref key, which
//! can do nothing but create; the read key, which would expose every ticket
//! this business has, is deliberately not used anywhere in Orqy.

use axum::{
    extract::{Extension, Multipart, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use reqwest::multipart::{Form, Part};

use crate::api::AppState;
use crate::auth::CurrentUser;

const DEFAULT_TICKET_URL: &str = "https://backend.gilroy.digital/api/public/tickets/";
const DEFAULT_BUSINESS_REF: &str = "ce09e735-38cf-40da-8504-f2b60bc04855";

// The ticket API's attachment rules. It is the authority and checks again,
// but checking here first turns a rejected upload into a sentence the user
// can act on before 25 MB has been shipped across the internet.
pub const MAX_FILES: usize = 5;
pub const MAX_FILE_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_TOTAL_BYTES: usize = 25 * 1024 * 1024;

/// Request body ceiling for the ticket route: every attachment at its limit
/// plus room for the text fields and multipart framing.
pub const BODY_LIMIT: usize = MAX_TOTAL_BYTES + 1024 * 1024;

fn ticket_url() -> String {
    std::env::var("TICKET_API_URL").unwrap_or_else(|_| DEFAULT_TICKET_URL.to_string())
}

fn business_ref() -> String {
    std::env::var("TICKET_BUSINESS_REF").unwrap_or_else(|_| DEFAULT_BUSINESS_REF.to_string())
}

/// The content type the API will accept for an extension, or None if the
/// extension is not on its whitelist. Derived here rather than trusting the
/// browser, which sends `.log` and `.har` as anything from "" to
/// application/octet-stream.
fn content_type_for(filename: &str) -> Option<&'static str> {
    let ext = filename.rsplit_once('.')?.1.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "pdf" => "application/pdf",
        "txt" | "log" => "text/plain",
        "csv" => "text/csv",
        "json" | "har" => "application/json",
        _ => return None,
    })
}

struct Attachment {
    filename: String,
    content_type: &'static str,
    bytes: Vec<u8>,
}

#[derive(Default)]
struct CreateTicketRequest {
    title: String,
    description: String,
    /// "bug" or "feature" — anything else is treated as a bug.
    ticket_type: Option<String>,
    /// Bugs only; ignored on a feature request.
    severity: Option<String>,
    /// Feature requests only; ignored on a bug.
    is_urgent: bool,
    /// Where in the UI the report came from, for the technical detail blob.
    page: Option<String>,
    attachments: Vec<Attachment>,
}

fn bad_request(msg: impl Into<String>) -> Response {
    (StatusCode::BAD_REQUEST, msg.into()).into_response()
}

async fn read_form(mut multipart: Multipart) -> Result<CreateTicketRequest, Response> {
    let mut input = CreateTicketRequest::default();
    let mut total = 0usize;

    loop {
        let field = match multipart.next_field().await {
            Ok(Some(f)) => f,
            Ok(None) => break,
            Err(e) => return Err(bad_request(format!("Could not read the upload: {}", e))),
        };
        let name = field.name().unwrap_or_default().to_string();

        if name == "attachments" {
            let filename = field.file_name().unwrap_or("attachment").to_string();
            let content_type = content_type_for(&filename).ok_or_else(|| {
                bad_request(format!(
                    "{} can't be attached. Allowed: png, jpg, gif, webp, pdf, txt, log, csv, json, har.",
                    filename
                ))
            })?;
            if input.attachments.len() == MAX_FILES {
                return Err(bad_request(format!("At most {} files can be attached.", MAX_FILES)));
            }
            let bytes = field
                .bytes()
                .await
                .map_err(|e| bad_request(format!("Could not read {}: {}", filename, e)))?;
            if bytes.len() > MAX_FILE_BYTES {
                return Err(bad_request(format!("{} is over the 10 MB limit.", filename)));
            }
            total += bytes.len();
            if total > MAX_TOTAL_BYTES {
                return Err(bad_request("Attachments are over 25 MB in total."));
            }
            input.attachments.push(Attachment { filename, content_type, bytes: bytes.to_vec() });
            continue;
        }

        let value = field
            .text()
            .await
            .map_err(|e| bad_request(format!("Could not read {}: {}", name, e)))?;
        match name.as_str() {
            "title" => input.title = value,
            "description" => input.description = value,
            "type" => input.ticket_type = Some(value),
            "severity" => input.severity = Some(value),
            "is_urgent" => input.is_urgent = value == "true",
            "page" => input.page = Some(value),
            _ => {}
        }
    }

    Ok(input)
}

/// Technical context attached to every ticket. Stored against the ticket but
/// never emailed and never returned by the read API, so it is the right place
/// for the details that make a report actionable.
fn ticket_data(input: &CreateTicketRequest, username: &str, ticket_type: &str) -> serde_json::Value {
    serde_json::json!({
        "source": "orqy",
        "orqy_version": env!("CARGO_PKG_VERSION"),
        "orqy_username": username,
        "ticket_type": ticket_type,
        "page": input.page.as_deref().unwrap_or("unknown"),
        "host_os": std::env::consts::OS,
        "host_arch": std::env::consts::ARCH,
        "in_container": std::path::Path::new("/host").exists(),
    })
}

pub async fn create_ticket(
    State(state): State<AppState>,
    user: Option<Extension<CurrentUser>>,
    multipart: Multipart,
) -> Response {
    let username = match user {
        Some(Extension(u)) => u.username,
        None => return (StatusCode::UNAUTHORIZED, "Not signed in").into_response(),
    };

    // The reporter address comes from the account, never from the request —
    // a signed-in user can only raise a ticket as themselves. Accounts are
    // username-based, so a user whose username is not an address and who has
    // not set one has nothing to attribute the ticket to.
    let stored = crate::auth::stored_email(&state.pool, &username).await;
    let email = match crate::auth::resolve_reporter_email(&username, stored) {
        Some(e) => e,
        None => {
            return (
                StatusCode::PRECONDITION_REQUIRED,
                "Add an email address in Settings before submitting a ticket.",
            )
                .into_response()
        }
    };

    let input = match read_form(multipart).await {
        Ok(i) => i,
        Err(res) => return res,
    };

    let title = input.title.trim().to_string();
    if title.is_empty() {
        return bad_request("A title is required");
    }

    let ticket_type = match input.ticket_type.as_deref() {
        Some("feature") => "feature",
        _ => "bug",
    };

    let mut form = Form::new()
        .text("business_ref", business_ref())
        .text("title", title)
        .text("description", input.description.trim().to_string())
        .text("type", ticket_type)
        .text("email", email.clone())
        .text("data", ticket_data(&input, &username, ticket_type).to_string());

    // severity applies to bugs, is_urgent to features — send only the field
    // that applies.
    if ticket_type == "bug" {
        // The API quietly downgrades an unrecognised severity to medium; do it
        // here too so what we send is always one of the four real values.
        let severity = match input.severity.as_deref() {
            Some(s @ ("low" | "medium" | "high" | "critical")) => s,
            _ => "medium",
        };
        form = form.text("severity", severity.to_string());
    } else if input.is_urgent {
        // Only ever sent when true. Over multipart every value is a string,
        // and the API reads is_urgent by truthiness — "false" would flag it.
        form = form.text("is_urgent", "true");
    }

    let attachment_count = input.attachments.len();
    for a in input.attachments {
        let part = match Part::bytes(a.bytes).file_name(a.filename).mime_str(a.content_type) {
            Ok(p) => p,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };
        form = form.part("attachments", part);
    }

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
    {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let res = match client.post(ticket_url()).multipart(form).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Ticket submission failed: {}", e);
            return (
                StatusCode::BAD_GATEWAY,
                "Could not reach the ticket service. Please try again.",
            )
                .into_response();
        }
    };

    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    let json = serde_json::from_str::<serde_json::Value>(&body).ok();

    if !status.is_success() {
        tracing::error!("Ticket service returned {}: {}", status, body);
        // A 400 from the API is about what was sent — a file it refused, most
        // likely — and says so in a sentence worth showing the user.
        let reason = json
            .as_ref()
            .and_then(|j| j.get("error"))
            .and_then(|e| e.as_str())
            .filter(|_| status == reqwest::StatusCode::BAD_REQUEST);
        let msg = match reason {
            Some(r) => r.to_string(),
            None => format!("Ticket service rejected the report ({})", status),
        };
        return (StatusCode::BAD_GATEWAY, msg).into_response();
    }

    tracing::info!(
        "Ticket raised by {} as {} ({} attachment(s))",
        username,
        email,
        attachment_count
    );

    match json {
        Some(json) => (StatusCode::CREATED, Json(json)).into_response(),
        None => StatusCode::CREATED.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::content_type_for;

    #[test]
    fn content_types_follow_the_api_whitelist() {
        assert_eq!(content_type_for("shot.PNG"), Some("image/png"));
        assert_eq!(content_type_for("deploy.log"), Some("text/plain"));
        assert_eq!(content_type_for("network.har"), Some("application/json"));
        assert_eq!(content_type_for("archive.tar.gz"), None);
        assert_eq!(content_type_for("script.sh"), None);
        assert_eq!(content_type_for("noextension"), None);
    }
}
