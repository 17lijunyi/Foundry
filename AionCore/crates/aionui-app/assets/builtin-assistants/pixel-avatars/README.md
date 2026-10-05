# Foundry assistant portraits

This set contains 21 original pixel-style character portraits generated with the
built-in image-generation tool for Foundry. Each official assistant has a distinct
character and one visual cue related to its task. The shared composition is a
front-facing head-and-shoulders portrait on a transparent background. Exact
generation prompts are retained in [generation-prompts.json](generation-prompts.json).

The manifest in `../assistants.json` is the source of truth. The desktop avatar
picker uses the official assistant list returned by the backend, so the same
portraits are available to custom assistants without a duplicate asset catalog.
Selecting a portrait saves a managed copy through the existing assistant API.

| Group | Assistant | Character cue |
| --- | --- | --- |
| office | word-creator | Document editor with book pages |
| office | ppt-creator | Presentation designer with presentation pen |
| office | excel-creator | Spreadsheet analyst with grid |
| office | morph-ppt | Motion director with animation cue |
| office | morph-ppt-3d | 3D presentation director with cube |
| office | pitch-deck-creator | Pitch strategist with growth arrow |
| office | dashboard-creator | Dashboard analyst with bar chart |
| specialist | academic-paper | Researcher with book |
| specialist | financial-model-creator | Financial modeller with calculator |
| specialist | openclaw-setup | Deployment engineer with headset and tool |
| specialist | cowork | Work partner with files |
| specialist | game-3d | Game creator with controller |
| specialist | ui-ux-pro-max | Designer with stylus |
| specialist | planning-with-files | Planner with folder |
| community | human-3-coach | Growth coach with sprout |
| community | social-job-publisher | Recruitment communicator with megaphone |
| community | moltbook | Community partner with conversation cue |
| community | beautiful-mermaid | Diagram architect with connected nodes |
| community | story-roleplay | Storyteller with book and quill |
| community | word-form-creator | Form designer with checklist |
| community | aionui-assistant | Product manager with glasses and workshop cue |

All deliverable portraits are square RGBA PNGs, up to 512 × 512 pixels. Original
generated files remain outside the application bundle; the packaged files are
scaled for delivery without changing the artwork. No user-uploaded images or
personal data are included in this set.
