use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::{net::SocketAddr, path::PathBuf, sync::Arc};
use tower_http::{services::ServeDir, trace::TraceLayer};
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
struct AppState {
    static_dir: Arc<PathBuf>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let static_dir = Arc::new(PathBuf::from("static"));

    let app_state = AppState {
        static_dir: static_dir.clone(),
    };

    let serve_dir = ServeDir::new(static_dir.as_ref()).append_index_html_on_directories(true);

    let app = Router::new()
        .route("/", get(index))
        .nest_service("/", serve_dir)
        .with_state(app_state)
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("Listening on http://{}", addr);

    if let Err(err) = axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app).await {
        error!("server error: {}", err);
    }
}

async fn index(State(state): State<AppState>) -> impl IntoResponse {
    let index_path = state.static_dir.join("index.html");
    match tokio::fs::read(&index_path).await {
        Ok(contents) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "text/html; charset=utf-8")
            .body(contents.into())
            .unwrap(),
        Err(err) => {
            error!("failed to read index.html: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
