# Foundry Agent brand icons

Transparent, monochrome SVG marks for the Agent engine catalog. The desktop renderer tints `currentColor` through `ThemedLogo`, using the active theme's text color. All sizes keep their existing layout.

The Codex terminal mark and Claude Code pixel robot follow the supplied visual reference. Other marks preserve the bundled or upstream brand silhouette, with app-icon backplates removed. These assets are separate from provider logos and the 21 pixel character avatars.

`044_monochrome_agent_icons.sql` upgrades only bundled Agent icon references. The generated CLI assistant identity is refreshed by the existing startup reconciliation. Custom artwork, engine configuration, capabilities, enabled state, and assistant ordering are preserved. New asset URLs also avoid the previous immutable asset cache.

The 42 SVG files cover the engine identities present in the catalog, including the legacy gateway identities behind the 41 Agent rows in settings. The two OpenClaw entries share a mark. [sources.json](sources.json) records the original resource and source of each vector adaptation.

Additional upstream vector geometry comes from [Lobe Icons](https://github.com/lobehub/lobe-icons), under the [MIT license](LOBE-LICENSE). Pi retains its original MIT attribution to Earendil Inc. contained in the source SVG. Brand names and trademarks belong to their owners.
