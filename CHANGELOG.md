# Changelog

## [0.2.0] - 2026-05-18

### Added

- Added in-editor find/search support with match highlighting and next/previous navigation.

### Changed

- Mermaid previews now keep the last valid diagram visible when edits temporarily make the diagram invalid.
- Mermaid preview pan/zoom state is preserved across rerenders.
- Fixed the extension activation test to resolve the published extension id correctly.

## [0.1.1] - 2026-04-16

### Changed

- Mermaid diagrams now load from the jsDelivr CDN instead of being bundled, reducing extension size from ~856 KB to ~26 KB.
- Added extension icon.
- Fixed Marketplace category (was `Editors`, now `Other`).

## [0.1.0] - 2026-04-16

### Added

- Initial release of Madie as a markdown WYSIWYG-style editor for VS Code.
- Custom editor support for `.md` files.
- Live Markdown rendering and round-trip editing through a themed webview.
- Font family and font size settings for the editor experience.
