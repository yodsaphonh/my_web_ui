# Stable Diffusion Web UI Starter

This project provides a minimal Rust web server and static web interface for interacting with the Automatic1111 Stable Diffusion API.

## Features
- Axum-based server that serves the compiled static assets on `http://localhost:8080`.
- Dark themed single-page interface with inputs for the base API URL, model selection, prompt settings, and seed control.
- Progress polling and animated noise preview while images are generated.
- Gallery view that displays the resulting txt2img outputs, along with metadata extracted from the API response.

## Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) toolchain with `cargo`.
- Access to a running Automatic1111 web UI instance (local or remote) with its API enabled.

## Running the server
```bash
cargo run
```
The server listens on port `8080` by default.

## Using the web interface
1. Open `http://localhost:8080` in your browser.
2. Enter the base API URL of your Automatic1111 instance (for example, `http://127.0.0.1:7860`).
3. Click **Refresh Models** to load the available checkpoints.
4. Fill in your prompt parameters and click **Generate**.
5. Watch the progress bar and noise preview update until the final image appears in the gallery.

All API routes exposed by Automatic1111 are listed in `All_API_Route.json`, which can serve as a reference for expanding the UI with additional capabilities.

## Development tips
- Modify the static assets inside the `static/` directory. They are served directly without additional build steps.
- `cargo fmt` keeps the Rust source formatted.
- `cargo check` verifies that the server compiles (requires access to crates.io).

## Roadmap ideas
- Support for img2img and other Automatic1111 endpoints.
- Persistent settings storage.
- Enhanced gallery management, including downloads and history.

Contributions and suggestions are welcome!
