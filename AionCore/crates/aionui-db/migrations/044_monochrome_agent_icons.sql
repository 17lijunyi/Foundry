-- Presentation-only Agent brand icons. Dedicated URLs avoid stale immutable
-- caches and leave shared provider logos and custom uploads unchanged.
UPDATE agent_metadata
SET icon = CASE
    WHEN backend = 'kiro' AND (icon IS NULL OR trim(icon) = '')
        THEN '/api/assets/logos/agents/coding/kiro.svg'
    ELSE CASE icon
    WHEN '/api/assets/logos/brand/aion.svg' THEN '/api/assets/logos/agents/core/aion.svg'
    WHEN '/api/assets/logos/ai-major/claude.svg' THEN '/api/assets/logos/agents/core/claude.svg'
    WHEN '/api/assets/logos/tools/coding/codex.svg' THEN '/api/assets/logos/agents/core/codex.svg'
    WHEN '/api/assets/logos/ai-major/gemini.svg' THEN '/api/assets/logos/agents/core/gemini.svg'
    WHEN '/api/assets/logos/ai-china/kimi.svg' THEN '/api/assets/logos/agents/core/kimi.svg'
    WHEN '/api/assets/logos/ai-china/qwen.svg' THEN '/api/assets/logos/agents/core/qwen.svg'
    WHEN '/api/assets/logos/acp-registry/mimo-code.svg' THEN '/api/assets/logos/agents/core/mimo-code.svg'
    WHEN '/api/assets/logos/tools/pi.svg' THEN '/api/assets/logos/agents/core/pi.svg'
    WHEN '/api/assets/logos/tools/coding/codebuddy.svg' THEN '/api/assets/logos/agents/coding/codebuddy.svg'
    WHEN '/api/assets/logos/tools/coding/cursor.png' THEN '/api/assets/logos/agents/coding/cursor.svg'
    WHEN '/api/assets/logos/tools/coding/qoder.png' THEN '/api/assets/logos/agents/coding/qoder.svg'
    WHEN '/api/assets/logos/tools/coding/opencode-light.svg' THEN '/api/assets/logos/agents/coding/opencode.svg'
    WHEN '/api/assets/logos/ai-major/mistral.svg' THEN '/api/assets/logos/agents/coding/vibe.svg'
    WHEN '/api/assets/logos/tools/coding/snow.png' THEN '/api/assets/logos/agents/coding/snow.svg'
    WHEN '/api/assets/logos/tools/github.svg' THEN '/api/assets/logos/agents/coding/copilot.svg'
    WHEN '/api/assets/logos/brand/auggie.svg' THEN '/api/assets/logos/agents/runtimes/auggie.svg'
    WHEN '/api/assets/logos/brand/droid.svg' THEN '/api/assets/logos/agents/runtimes/droid.svg'
    WHEN '/api/assets/logos/tools/goose.svg' THEN '/api/assets/logos/agents/runtimes/goose.svg'
    WHEN '/api/assets/logos/brand/hermes.svg' THEN '/api/assets/logos/agents/runtimes/hermes.svg'
    WHEN '/api/assets/logos/tools/openclaw.svg' THEN '/api/assets/logos/agents/runtimes/openclaw.svg'
    WHEN '/api/assets/logos/tools/nanobot.svg' THEN '/api/assets/logos/agents/runtimes/nanobot.svg'
    WHEN '/api/assets/logos/ai-major/antigravity.svg' THEN '/api/assets/logos/agents/runtimes/antigravity.svg'
    WHEN '/api/assets/logos/acp-registry/amp-acp.svg' THEN '/api/assets/logos/agents/registry-a/amp-acp.svg'
    WHEN '/api/assets/logos/acp-registry/autohand.svg' THEN '/api/assets/logos/agents/registry-a/autohand.svg'
    WHEN '/api/assets/logos/acp-registry/cortex-code.svg' THEN '/api/assets/logos/agents/registry-a/cortex-code.svg'
    WHEN '/api/assets/logos/acp-registry/corust-agent.svg' THEN '/api/assets/logos/agents/registry-a/corust-agent.svg'
    WHEN '/api/assets/logos/acp-registry/deepagents.svg' THEN '/api/assets/logos/agents/registry-a/deepagents.svg'
    WHEN '/api/assets/logos/acp-registry/devin.svg' THEN '/api/assets/logos/agents/registry-a/devin.svg'
    WHEN '/api/assets/logos/acp-registry/dimcode.svg' THEN '/api/assets/logos/agents/registry-a/dimcode.svg'
    WHEN '/api/assets/logos/acp-registry/dirac.svg' THEN '/api/assets/logos/agents/registry-a/dirac.svg'
    WHEN '/api/assets/logos/acp-registry/glm-acp-agent.svg' THEN '/api/assets/logos/agents/registry-a/glm-acp-agent.svg'
    WHEN '/api/assets/logos/acp-registry/grok.svg' THEN '/api/assets/logos/agents/registry-b/grok.svg'
    WHEN '/api/assets/logos/acp-registry/harn.svg' THEN '/api/assets/logos/agents/registry-b/harn.svg'
    WHEN '/api/assets/logos/acp-registry/junie.svg' THEN '/api/assets/logos/agents/registry-b/junie.svg'
    WHEN '/api/assets/logos/acp-registry/kilo.svg' THEN '/api/assets/logos/agents/registry-b/kilo.svg'
    WHEN '/api/assets/logos/acp-registry/nova.svg' THEN '/api/assets/logos/agents/registry-b/nova.svg'
    WHEN '/api/assets/logos/acp-registry/omp.svg' THEN '/api/assets/logos/agents/registry-b/omp.svg'
    WHEN '/api/assets/logos/acp-registry/poolside.svg' THEN '/api/assets/logos/agents/registry-b/poolside.svg'
    WHEN '/api/assets/logos/acp-registry/sigit.svg' THEN '/api/assets/logos/agents/registry-b/sigit.svg'
    WHEN '/api/assets/logos/acp-registry/stakpak.svg' THEN '/api/assets/logos/agents/registry-b/stakpak.svg'
    WHEN '/api/assets/logos/acp-registry/vtcode.svg' THEN '/api/assets/logos/agents/registry-b/vtcode.svg'
        ELSE icon
    END
END
WHERE agent_source IN ('builtin', 'internal');
