# wsdl-viewer

Browse SOAP/WSDL service contracts in a browser — no build step, no backend.

Imported `.wsdl` files are transformed to `.xml`, injected with an XSL stylesheet
([tomi-vanek/wsdl-viewer](https://github.com/tomi-vanek/wsdl-viewer)), and served
locally. Opening a file renders a human-readable HTML view of the service contract.

## Requirements

- Node.js 18+
- Git (with submodule support)

## Installation

```bash
git clone --recurse-submodules git@github.com:Mikuc/wsdl-viewer.git
cd wsdl-viewer
```

If you already cloned without `--recurse-submodules`:

```bash
npm run setup
```

## Usage

### Import WSDL files

Point the importer at any directory — it searches recursively for `.wsdl` files.

```bash
npm run import -- /path/to/wsdl/directory
```

Preview what will be imported without writing anything:

```bash
npm run import -- /path/to/wsdl/directory --dry-run
```

Re-running import is safe — unchanged files are skipped (checksum check).

### Start the viewer

```bash
npm start
# or on a custom port:
PORT=8080 npm start
```

Opens a local server at `http://localhost:3000` by default (or the next available port if
3000 is already in use — check the terminal output for the actual URL). The home page lists
all imported services with a live search filter. Click any service to open the XSL-rendered view.

## How naming works

The service name used for the output file is resolved in this order:

1. `name` attribute on `<wsdl:definitions>` — most reliable, straight from the contract
2. Parent directory name — useful when the file is named generically (e.g. `generated.wsdl`)
3. Filename without extension — last resort

Collisions are resolved with a numeric suffix: `OrderService`, `OrderService_2`, etc.

## Project structure

```
wsdl-viewer/
  vendor/wsdl-viewer/   # git submodule — tomi-vanek/wsdl-viewer (Apache 2.0)
  services/             # imported and transformed XML files (git-ignored)
  src/
    import.mjs          # import CLI
  index.html            # service list UI
  services.json         # import metadata (auto-generated)
  package.json
  NOTICE                # Apache 2.0 attribution for vendored code
```

## License

MIT — see [LICENSE](LICENSE).
Vendored XSL stylesheet: Apache 2.0 — see [NOTICE](NOTICE).
