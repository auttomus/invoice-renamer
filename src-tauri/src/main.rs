// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
struct PreviewResult {
    old_name: String,
    new_name: String,
}

#[derive(Serialize)]
struct RenameResult {
    old_name: String,
    new_name: String,
    status: String, // "OK", "SKIP", "GAGAL"
}

/// Langkah 1 — buang prefix OutputTaxInvoice-<UUID>- (Jika ada)
fn strip_prefix(name: &str) -> Option<String> {
    let lower = name.to_lowercase();
    if !lower.starts_with("outputtaxinvoice-") {
        return None;
    }

    // "OutputTaxInvoice-" = 17 karakter
    let after = &name[17..];
    if after.len() < 37 {
        return None;
    }

    // Cek apakah setelah prefix ada pola UUID (8-4-4-4-12)
    let uuid_part = &after[..36];
    let uuid_split: Vec<&str> = uuid_part.split('-').collect();
    let is_uuid = uuid_split.len() == 5
        && uuid_split[0].len() == 8
        && uuid_split[1].len() == 4
        && uuid_split[2].len() == 4
        && uuid_split[3].len() == 4
        && uuid_split[4].len() == 12;

    if !is_uuid {
        return None;
    }

    // Ambil sisa setelah UUID dan tanda hubung pemisah
    if after.chars().nth(36) != Some('-') {
        return None;
    }

    let rest = &after[37..];
    if rest.is_empty() {
        return None;
    }
    Some(rest.to_string())
}

/// Langkah 2 — tukar blok ke-2 dan ke-3 (A-B-C.ext -> A-C-B.ext)
fn reorder_parts(name: &str) -> Option<String> {
    // Pisahkan nama file dari ekstensinya
    let (stem, ext) = match name.rfind('.') {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };

    let parts: Vec<&str> = stem.split('-').collect();

    // Kita hanya memproses jika ada minimal 3 blok angka (A-B-C)
    if parts.len() < 3 {
        return None;
    }

    // Reorder: Blok 1 - Blok 3 - Blok 2 (Sisanya biarkan jika ada blok 4 dst)
    let mut new_parts = parts.clone();
    new_parts[1] = parts[2];
    new_parts[2] = parts[1];

    let new_stem = new_parts.join("-");
    Some(format!("{}{}", new_stem, ext))
}

/// Pipeline transformasi nama file
fn transform(name: &str) -> Option<String> {
    // Cek apakah ada prefix OutputTaxInvoice
    if let Some(stripped) = strip_prefix(name) {
        // Jika ada prefix, bersihkan dulu baru reorder
        return Some(reorder_parts(&stripped).unwrap_or(stripped));
    }

    // Jika tidak ada prefix, coba langsung reorder (untuk pola angka murni)
    reorder_parts(name)
}

// --- Fungsi preview_invoices dan process_invoices tetap sama ---
#[tauri::command]
fn preview_invoices(folder_path: String) -> Result<Vec<PreviewResult>, String> {
    let folder = PathBuf::from(folder_path);
    let entries = fs::read_dir(&folder).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            let old_name = entry.file_name().to_string_lossy().into_owned();
            if let Some(new_name) = transform(&old_name) {
                if new_name != old_name {
                    results.push(PreviewResult { old_name, new_name });
                }
            }
        }
    }
    results.sort_by(|a, b| a.new_name.cmp(&b.new_name));
    Ok(results)
}

#[tauri::command]
fn process_invoices(
    folder_path: String,
    selected_files: Vec<String>,
) -> Result<Vec<RenameResult>, String> {
    let folder = PathBuf::from(folder_path);
    let mut results = Vec::new();
    for old_name in selected_files {
        let path = folder.join(&old_name);
        if !path.exists() {
            results.push(RenameResult {
                old_name,
                new_name: String::new(),
                status: "GAGAL".to_string(),
            });
            continue;
        }
        if let Some(new_name) = transform(&old_name) {
            let new_path = folder.join(&new_name);
            let status = if new_path.exists() {
                "SKIP".to_string()
            } else {
                match fs::rename(&path, &new_path) {
                    Ok(_) => "OK".to_string(),
                    Err(_) => "GAGAL".to_string(),
                }
            };
            results.push(RenameResult {
                old_name,
                new_name,
                status,
            });
        }
    }
    Ok(results)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![preview_invoices, process_invoices])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
