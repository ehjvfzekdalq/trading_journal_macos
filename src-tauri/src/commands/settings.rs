use tauri::State;
use crate::db::Database;
use crate::models::{Settings, UpdateSettingsInput};

#[tauri::command]
pub async fn get_settings(db: State<'_, Database>) -> Result<Settings, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let settings = conn.query_row(
        "SELECT id, initial_capital, current_r_percent, default_min_rr, default_leverage, currency, enable_position_monitor, enable_api_connections, created_at, updated_at FROM settings WHERE id = 1",
        [],
        |row| {
            Ok(Settings {
                id: row.get(0)?,
                initial_capital: row.get(1)?,
                current_r_percent: row.get(2)?,
                default_min_rr: row.get(3)?,
                default_leverage: row.get(4)?,
                currency: row.get(5)?,
                enable_position_monitor: row.get::<_, i32>(6)? == 1,
                enable_api_connections: row.get::<_, i32>(7)? == 1,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    ).map_err(|e| e.to_string())?;

    Ok(settings)
}

#[tauri::command]
pub async fn update_settings(
    db: State<'_, Database>,
    settings: UpdateSettingsInput,
) -> Result<Settings, String> {
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        // Build dynamic UPDATE query
        let mut updates = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(val) = settings.initial_capital {
            updates.push("initial_capital = ?");
            values.push(Box::new(val));
        }
        if let Some(val) = settings.current_r_percent {
            updates.push("current_r_percent = ?");
            values.push(Box::new(val));
        }
        if let Some(val) = settings.default_min_rr {
            updates.push("default_min_rr = ?");
            values.push(Box::new(val));
        }
        if let Some(val) = settings.default_leverage {
            updates.push("default_leverage = ?");
            values.push(Box::new(val));
        }
        if let Some(val) = settings.currency {
            updates.push("currency = ?");
            values.push(Box::new(val));
        }
        if let Some(val) = settings.enable_position_monitor {
            updates.push("enable_position_monitor = ?");
            values.push(Box::new(val as i32));
        }
        if let Some(val) = settings.enable_api_connections {
            updates.push("enable_api_connections = ?");
            values.push(Box::new(val as i32));
        }

        updates.push("updated_at = strftime('%s', 'now')");

        let query = format!("UPDATE settings SET {} WHERE id = 1", updates.join(", "));
        let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v.as_ref()).collect();

        conn.execute(&query, params.as_slice()).map_err(|e| e.to_string())?;
    }

    get_settings(db).await
}
