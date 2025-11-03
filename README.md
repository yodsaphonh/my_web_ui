# Stable Diffusion Web UI Starter

This project provides a minimal Rust web server and static web interface for interacting with the Automatic1111 Stable Diffusion API.

## Features
- Axum-based server that serves the compiled static assets on `http://localhost:8080`.
- Dark themed single-page interface with inputs for the base API URL, model selection, prompt settings, and seed control.
- Prompt textareas include tag autocomplete backed by a curated subset of the [a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete) dataset, with runtime support for merging additional CSV/JSON tag lists.
- Progress polling and animated noise preview while images are generated.
- Gallery view that displays the resulting txt2img outputs, along with metadata extracted from the API response.

## Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) toolchain with `cargo`.
- Access to a running Automatic1111 web UI instance (local or remote) with its API enabled.

> **Troubleshooting builds**
>
> If `cargo build` fails with a message like `use of unstable library feature 'fd_lock'` or complains that a dependency
> requires a newer compiler, update your toolchain by running `rustup update stable`. Windows users should ensure they are on
> the MSVC toolchain via `rustup default stable-x86_64-pc-windows-msvc`.

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

### Customizing tag autocomplete datasets

The bundled `static/tagcomplete-data.json` contains a lightweight selection of popular prompts so autocomplete works out of the box.

#### Merge CSV/JSON files from the browser

1. Click **Load CSV/JSON** in the Tag Autocomplete Dataset card.
2. Select one or more TagComplete `.csv` files (for example `danbooru.csv`, `danbooru_e621_merged.csv`, etc.) or a compatible `.json` export.
3. The browser parses every file locally, merges the results with the current dataset, and updates the tag count indicator.

You can repeat the process at any time—the loader deduplicates tags and aliases so it is safe to add overlapping files.

#### Preloading datasets from disk

The manifest `static/tagcomplete-sources.json` controls which files are fetched on page load. By default it references the bundled starter JSON:

```json
{
  "datasets": [
    { "url": "/tagcomplete-data.json", "format": "json", "label": "Starter dataset" }
  ]
}
```

Add additional entries (CSV or JSON) to the `datasets` array to make them available automatically. Each entry accepts `url`, `format` (`csv` or `json`), and an optional `label` used in log messages.

To obtain fresh data from [DominikDoom/a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete) you can either reuse the provided `.csv` files or run the upstream export scripts to generate your own JSON. Drop the files into `static/` (or host them elsewhere) and update the manifest or use the in-browser loader as described above.

## Development tips
- Modify the static assets inside the `static/` directory. They are served directly without additional build steps.
- `cargo fmt` keeps the Rust source formatted.
- `cargo check` verifies that the server compiles (requires access to crates.io).

## Roadmap ideas
- Support for img2img and other Automatic1111 endpoints.
- Persistent settings storage.
- Enhanced gallery management, including downloads and history.

Contributions and suggestions are welcome!
