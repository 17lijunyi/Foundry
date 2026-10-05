use aionui_db::{IAgentMetadataRepository, SqliteAgentMetadataRepository, init_database_memory};
use sqlx::SqlitePool;

const MIGRATION: &str = include_str!("../migrations/044_monochrome_agent_icons.sql");

async fn non_icon_snapshot(pool: &SqlitePool) -> Vec<String> {
    let columns: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_table_info('agent_metadata') WHERE name != 'icon'")
            .fetch_all(pool)
            .await
            .unwrap();
    let fields = columns
        .iter()
        .map(|name| format!("'{name}', \"{name}\""))
        .collect::<Vec<_>>()
        .join(", ");
    sqlx::query_scalar(&format!("SELECT json_object({fields}) FROM agent_metadata ORDER BY id"))
        .fetch_all(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn all_shipped_agents_have_dedicated_brand_icons() {
    let db = init_database_memory().await.unwrap();
    let repo = SqliteAgentMetadataRepository::new(db.pool().clone());
    let agents = repo.list_all().await.unwrap();
    let builtin = agents
        .iter()
        .filter(|agent| matches!(agent.agent_source.as_str(), "builtin" | "internal"));
    for agent in builtin {
        assert!(
            agent
                .icon
                .as_deref()
                .is_some_and(|icon| icon.starts_with("/api/assets/logos/agents/") && icon.ends_with(".svg")),
            "{} is missing its theme-aware brand icon",
            agent.name
        );
    }
}

#[tokio::test]
async fn upgrading_existing_icons_preserves_settings_and_custom_artwork() {
    let db = init_database_memory().await.unwrap();
    let pool = db.pool();
    sqlx::query("UPDATE agent_metadata SET icon = '/api/assets/logos/ai-major/claude.svg', enabled = 0, command = '/custom/claude', args = '[\"custom\"]' WHERE id = '2d23ff1c'")
        .execute(pool).await.unwrap();
    sqlx::query("INSERT INTO agent_metadata (id, agent_id, name, backend, agent_type, agent_source, icon, enabled, created_at, updated_at) VALUES ('custom-icon-check', 'custom-icon-check', 'Custom artwork', 'claude', 'acp', 'custom', '/api/assets/logos/ai-major/claude.svg', 1, 1, 1)")
        .execute(pool).await.unwrap();
    sqlx::query("UPDATE agent_metadata SET icon = 'https://custom.example/gemini.svg' WHERE id = 'cc126dd5'")
        .execute(pool)
        .await
        .unwrap();
    let before = non_icon_snapshot(pool).await;

    sqlx::raw_sql(MIGRATION).execute(pool).await.unwrap();
    assert_eq!(non_icon_snapshot(pool).await, before, "Only icon references may change");
    let icons: Vec<(String, String)> = sqlx::query_as(
        "SELECT id, icon FROM agent_metadata WHERE id IN ('2d23ff1c', 'custom-icon-check', 'cc126dd5') ORDER BY id",
    )
    .fetch_all(pool)
    .await
    .unwrap();
    assert_eq!(
        icons,
        vec![
            ("2d23ff1c".into(), "/api/assets/logos/agents/core/claude.svg".into()),
            ("cc126dd5".into(), "https://custom.example/gemini.svg".into()),
            (
                "custom-icon-check".into(),
                "/api/assets/logos/ai-major/claude.svg".into()
            ),
        ]
    );

    sqlx::raw_sql(MIGRATION).execute(pool).await.unwrap();
    assert_eq!(
        non_icon_snapshot(pool).await,
        before,
        "Repeated upgrades must preserve all settings"
    );
}
