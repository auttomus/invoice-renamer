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

/// Cek apakah string adalah UUID format (8-4-4-4-12) dengan separator dash
fn is_uuid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.len() == 5
        && parts[0].len() == 8
        && parts[1].len() == 4
        && parts[2].len() == 4
        && parts[3].len() == 4
        && parts[4].len() == 12
        && parts
            .iter()
            .all(|p| p.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Langkah 1a — buang prefix OutputTaxInvoice-<UUID>- (separator dash)
/// Contoh: OutputTaxInvoice-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-A-B-C.pdf -> A-B-C.pdf
fn strip_prefix_dash(name: &str) -> Option<String> {
    let lower = name.to_lowercase();
    if !lower.starts_with("outputtaxinvoice-") {
        return None;
    }

    // "OutputTaxInvoice-" = 17 karakter
    let after = &name[17..];
    if after.len() < 37 {
        return None;
    }

    // Cek UUID (8-4-4-4-12) dengan separator dash
    let uuid_part = &after[..36];
    if !is_uuid(uuid_part) {
        return None;
    }

    // Separator setelah UUID harus dash
    if after.chars().nth(36) != Some('-') {
        return None;
    }

    let rest = &after[37..];
    if rest.is_empty() {
        return None;
    }
    Some(rest.to_string())
}

/// Langkah 1b — buang prefix OutputTaxInvoice_<UUID>_ (separator underscore)
/// Contoh: OutputTaxInvoice_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx_A_B_C.pdf -> A_B_C.pdf
fn strip_prefix_underscore(name: &str) -> Option<String> {
    let lower = name.to_lowercase();
    if !lower.starts_with("outputtaxinvoice_") {
        return None;
    }

    // "OutputTaxInvoice_" = 17 karakter
    let after = &name[17..];
    if after.len() < 37 {
        return None;
    }

    // UUID-nya tetap pakai dash di dalamnya: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 char)
    let uuid_part = &after[..36];
    if !is_uuid(uuid_part) {
        return None;
    }

    // Separator setelah UUID harus underscore
    if after.chars().nth(36) != Some('_') {
        return None;
    }

    let rest = &after[37..];
    if rest.is_empty() {
        return None;
    }
    Some(rest.to_string())
}

/// Pembersihan karakter ilegal filesystem Windows (< > : " / \ | ? *)
fn sanitize_filename_part(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '<' | '>' | '|' => '-',
            '"' => '\'', // konversi double quote menjadi single quote yang valid
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Transformasi Format Coretax (5 blok dipisahkan " - "):
/// Input : [Periode] - [NSFP] - [Nama Penjual] - [Nama Toko] - [No Faktur].pdf
/// Output: [Nama Toko] - [No Faktur] - [Periode] - [Nama Penjual] - [NSFP].pdf
fn transform_coretax_5parts(name: &str) -> Option<String> {
    let (stem, ext) = match name.rfind('.') {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };

    // Delimiter harus " - " (spasi-strip-spasi)
    let parts: Vec<&str> = stem.split(" - ").collect();
    if parts.len() != 5 {
        return None;
    }

    let period = parts[0].trim();
    let nsfp = parts[1].trim();
    let seller = parts[2].trim();
    let buyer = parts[3].trim();
    let invoice_no = parts[4].trim();

    // Validasi pola periode: YYYY-MM (panjang 7, format tahun 4 digit - bulan 2 digit)
    if period.len() != 7 || period.chars().nth(4) != Some('-') {
        return None;
    }
    let (p_year, p_month) = (&period[..4], &period[5..]);
    if !p_year.chars().all(|c| c.is_ascii_digit()) || !p_month.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    // Validasi NSFP: angka minimal 10 digit (format Coretax 16-17 digit)
    if nsfp.len() < 10 || !nsfp.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    // Nomor faktur & nama toko tidak boleh kosong
    // Nomor faktur didukung alfanumerik (misal 3360234851 atau 336BA10045)
    if buyer.is_empty() || invoice_no.is_empty() {
        return None;
    }

    let buyer_clean = sanitize_filename_part(buyer);
    let invoice_no_clean = sanitize_filename_part(invoice_no);
    let period_clean = sanitize_filename_part(period);
    let seller_clean = sanitize_filename_part(seller);
    let nsfp_clean = sanitize_filename_part(nsfp);

    Some(format!(
        "{} - {} - {} - {} - {}{}",
        buyer_clean, invoice_no_clean, period_clean, seller_clean, nsfp_clean, ext
    ))
}

/// Langkah 2a — tukar blok ke-2 dan ke-3 dengan separator dash (A-B-C.ext -> A-C-B.ext)
fn reorder_parts_dash(name: &str) -> Option<String> {
    let (stem, ext) = match name.rfind('.') {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };

    if stem.contains(" - ") {
        return None;
    }

    let parts: Vec<&str> = stem.split('-').collect();
    if parts.len() < 3 {
        return None;
    }

    let mut new_parts = parts.clone();
    new_parts[1] = parts[2];
    new_parts[2] = parts[1];

    Some(format!("{}{}", new_parts.join("-"), ext))
}

/// Langkah 2b — tukar blok ke-2 dan ke-3 dengan separator underscore (A_B_C.ext -> A_C_B.ext)
fn reorder_parts_underscore(name: &str) -> Option<String> {
    let (stem, ext) = match name.rfind('.') {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };

    if stem.contains(" _ ") {
        return None;
    }

    let parts: Vec<&str> = stem.split('_').collect();
    if parts.len() < 3 {
        return None;
    }

    let mut new_parts = parts.clone();
    new_parts[1] = parts[2];
    new_parts[2] = parts[1];

    Some(format!("{}{}", new_parts.join("_"), ext))
}

/// Pipeline transformasi nama file
fn transform(name: &str) -> Option<String> {
    // Format Coretax: 5 blok dengan pemisah " - "
    // Contoh: 2026-10 - 04002600451520535 - SEKAR NUSA BARUNA - INDOMARCO PRISMATAMA - 3360234851.pdf
    // Hasil  : INDOMARCO PRISMATAMA - 3360234851 - 2026-10 - SEKAR NUSA BARUNA - 04002600451520535.pdf
    if let Some(coretax) = transform_coretax_5parts(name) {
        return Some(coretax);
    }

    // Format 1: separator dash — OutputTaxInvoice-<UUID>-A-B-C.pdf
    if let Some(stripped) = strip_prefix_dash(name) {
        return Some(reorder_parts_dash(&stripped).unwrap_or(stripped));
    }

    // Format 2: separator underscore — OutputTaxInvoice_<UUID>_A_B_C.pdf
    if let Some(stripped) = strip_prefix_underscore(name) {
        return Some(reorder_parts_underscore(&stripped).unwrap_or(stripped));
    }

    // Fallback: tidak ada prefix, coba reorder langsung (pola angka murni dengan dash)
    reorder_parts_dash(name)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_coretax_numeric_invoice() {
        let input = "2026-10 - 04002600451520535 - SEKAR NUSA BARUNA - INDOMARCO PRISMATAMA - 3360234851.pdf";
        let expected = "INDOMARCO PRISMATAMA - 3360234851 - 2026-10 - SEKAR NUSA BARUNA - 04002600451520535.pdf";
        assert_eq!(transform(input), Some(expected.to_string()));
    }

    #[test]
    fn test_transform_coretax_alphanumeric_invoice() {
        let input = "2026-10 - 04002600451520567 - SEKAR NUSA BARUNA - SENTRAL RETAILINDO DEWATA - 336BA10045.pdf";
        let expected = "SENTRAL RETAILINDO DEWATA - 336BA10045 - 2026-10 - SEKAR NUSA BARUNA - 04002600451520567.pdf";
        assert_eq!(transform(input), Some(expected.to_string()));
    }

    #[test]
    fn test_transform_coretax_quotes_in_store_name() {
        let input = "2026-10 - 04002600451520553 - SEKAR NUSA BARUNA - BOBY '76' - 3362082624.pdf";
        let expected = "BOBY '76' - 3362082624 - 2026-10 - SEKAR NUSA BARUNA - 04002600451520553.pdf";
        assert_eq!(transform(input), Some(expected.to_string()));
    }

    #[test]
    fn test_transform_coretax_sanitization() {
        let input = "2026-10 - 04002600451520553 - SEKAR NUSA BARUNA - TOKO \"BERKAH\" / AB - 3362082624.pdf";
        let expected = "TOKO 'BERKAH' - AB - 3362082624 - 2026-10 - SEKAR NUSA BARUNA - 04002600451520553.pdf";
        assert_eq!(transform(input), Some(expected.to_string()));
    }

    #[test]
    fn test_transform_already_renamed_returns_none() {
        let input = "INDOMARCO PRISMATAMA - 3360234851 - 2026-10 - SEKAR NUSA BARUNA - 04002600451520535.pdf";
        assert_eq!(transform(input), None);
    }

    #[test]
    fn test_transform_legacy_dash_uuid() {
        let input = "OutputTaxInvoice-550e8400-e29b-41d4-a716-446655440000-010-002-24.pdf";
        let expected = "010-24-002.pdf";
        assert_eq!(transform(input), Some(expected.to_string()));
    }
}
