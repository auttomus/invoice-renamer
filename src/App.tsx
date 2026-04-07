import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

type PreviewResult = {
  old_name: string;
  new_name: string;
};

type RenameResult = {
  old_name: string;
  new_name: string;
  status: string;
};

type Step = "select" | "preview" | "done";

export default function App() {
  const [step, setStep] = useState<Step>("select");
  const [folderPath, setFolderPath] = useState("");
  const [previews, setPreviews] = useState<PreviewResult[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<RenameResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1 – pilih folder & ambil preview
  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Pilih Folder Invoice",
      });
      if (!selected) return;

      setIsLoading(true);
      setFolderPath(selected as string);

      const res: PreviewResult[] = await invoke("preview_invoices", {
        folderPath: selected,
      });

      setPreviews(res);
      // Default: semua dicentang
      setChecked(new Set(res.map((_, i) => i)));
      setStep("preview");
    } catch (err) {
      alert("Gagal membaca folder: " + err);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2 – toggle checklist
  const toggleAll = () => {
    if (checked.size === previews.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(previews.map((_, i) => i)));
    }
  };

  const toggleOne = (i: number) => {
    const next = new Set(checked);
    next.has(i) ? next.delete(i) : next.add(i);
    setChecked(next);
  };

  // Step 2 – konfirmasi rename
  const handleConfirm = async () => {
    const selected = previews.filter((_, i) => checked.has(i));
    if (selected.length === 0) return;

    setIsLoading(true);
    try {
      const res: RenameResult[] = await invoke("process_invoices", {
        folderPath,
        selectedFiles: selected.map((p) => p.old_name),
      });
      setResults(res);
      setStep("done");
    } catch (err) {
      alert("Gagal rename: " + err);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset ke awal
  const handleReset = () => {
    setStep("select");
    setFolderPath("");
    setPreviews([]);
    setChecked(new Set());
    setResults([]);
  };

  const okCount = results.filter((r) => r.status === "OK").length;
  const skipCount = results.filter((r) => r.status === "SKIP").length;
  const failCount = results.filter((r) => r.status === "GAGAL").length;

  return (
    <div style={styles.root}>
      {/* Sidebar kiri */}
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.brandIcon}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="15" x2="15" y2="15" />
              <line x1="9" y1="11" x2="15" y2="11" />
            </svg>
          </div>
          <span style={styles.brandName}>
            Invoice
            <br />
            Renamer
          </span>
        </div>

        <nav style={styles.nav}>
          {(["select", "preview", "done"] as Step[]).map((s, i) => {
            const labels = ["Pilih Folder", "Preview", "Selesai"];
            const isActive = step === s;
            const isPast =
              (s === "select" && (step === "preview" || step === "done")) ||
              (s === "preview" && step === "done");
            return (
              <div key={s} style={styles.navItem}>
                <div
                  style={{
                    ...styles.navDot,
                    background: isActive
                      ? "#111"
                      : isPast
                        ? "#111"
                        : "transparent",
                    border: isPast
                      ? "2px solid #111"
                      : isActive
                        ? "2px solid #111"
                        : "2px solid #d1d5db",
                  }}
                >
                  {isPast ? (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span
                      style={{
                        fontSize: 10,
                        color: isActive ? "white" : "#9ca3af",
                        fontWeight: 600,
                      }}
                    >
                      {i + 1}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    ...styles.navLabel,
                    color: isActive ? "#111" : isPast ? "#111" : "#9ca3af",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {labels[i]}
                </span>
              </div>
            );
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          {folderPath && (
            <div style={styles.folderBadge}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span style={styles.folderBadgeText}>
                {folderPath.split("/").pop()}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Konten utama */}
      <main style={styles.main}>
        {/* ── STEP 1: Pilih Folder ── */}
        {step === "select" && (
          <div style={styles.centerPane}>
            <div style={styles.uploadZone} onClick={handleSelectFolder}>
              <div style={styles.uploadIcon}>
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p style={styles.uploadTitle}>
                {isLoading ? "Memuat..." : "Pilih folder invoice"}
              </p>
              <p style={styles.uploadSub}>
                Klik untuk browse folder di komputer kamu
              </p>
              <button
                style={styles.btnPrimary}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectFolder();
                }}
                disabled={isLoading}
              >
                {isLoading ? "Memuat..." : "Browse Folder"}
              </button>
            </div>
            <div style={styles.hint}>
              <p style={styles.hintText}>
                Aplikasi akan mendeteksi file PDF dengan format{" "}
                <code style={styles.code}>
                  OutputTaxInvoice-[UUID]-[nomor].pdf
                </code>{" "}
                dan menyusun ulang namanya secara otomatis.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 2: Preview ── */}
        {step === "preview" && (
          <div style={styles.pane}>
            <div style={styles.paneHeader}>
              <div>
                <h2 style={styles.paneTitle}>Preview Perubahan</h2>
                <p style={styles.paneSub}>
                  {previews.length} file terdeteksi · {checked.size} dipilih
                </p>
              </div>
              <div style={styles.headerActions}>
                <button style={styles.btnSecondary} onClick={handleReset}>
                  Batal
                </button>
                <button
                  style={{
                    ...styles.btnPrimary,
                    opacity: checked.size === 0 ? 0.4 : 1,
                  }}
                  onClick={handleConfirm}
                  disabled={isLoading || checked.size === 0}
                >
                  {isLoading ? "Memproses..." : `Rename ${checked.size} File`}
                </button>
              </div>
            </div>

            {previews.length === 0 ? (
              <div style={styles.emptyState}>
                <p style={{ color: "#6b7280", fontSize: 14 }}>
                  Tidak ada file yang perlu diubah di folder ini.
                </p>
                <button style={styles.btnSecondary} onClick={handleReset}>
                  Kembali
                </button>
              </div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.th, width: 40 }}>
                        <input
                          type="checkbox"
                          checked={checked.size === previews.length}
                          onChange={toggleAll}
                          style={styles.checkbox}
                        />
                      </th>
                      <th style={styles.th}>Nama Sekarang</th>
                      <th style={{ ...styles.th, width: 32 }}></th>
                      <th style={styles.th}>Nama Baru</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previews.map((p, i) => (
                      <tr
                        key={i}
                        style={{
                          ...styles.tr,
                          opacity: checked.has(i) ? 1 : 0.35,
                        }}
                        onClick={() => toggleOne(i)}
                      >
                        <td style={styles.td}>
                          <input
                            type="checkbox"
                            checked={checked.has(i)}
                            onChange={() => toggleOne(i)}
                            onClick={(e) => e.stopPropagation()}
                            style={styles.checkbox}
                          />
                        </td>
                        <td style={styles.td}>
                          <span style={styles.fileOld}>{p.old_name}</span>
                        </td>
                        <td style={{ ...styles.td, textAlign: "center" }}>
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#9ca3af"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.fileNew}>{p.new_name}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Done ── */}
        {step === "done" && (
          <div style={styles.pane}>
            <div style={styles.paneHeader}>
              <div>
                <h2 style={styles.paneTitle}>Selesai</h2>
                <p style={styles.paneSub}>
                  Proses rename telah selesai dijalankan
                </p>
              </div>
              <button style={styles.btnPrimary} onClick={handleReset}>
                Mulai Lagi
              </button>
            </div>

            {/* Summary cards */}
            <div style={styles.summaryRow}>
              <div style={{ ...styles.summaryCard, borderColor: "#d1fae5" }}>
                <span style={{ ...styles.summaryNum, color: "#059669" }}>
                  {okCount}
                </span>
                <span style={styles.summaryLabel}>Berhasil</span>
              </div>
              <div style={{ ...styles.summaryCard, borderColor: "#fef3c7" }}>
                <span style={{ ...styles.summaryNum, color: "#d97706" }}>
                  {skipCount}
                </span>
                <span style={styles.summaryLabel}>Dilewati</span>
              </div>
              <div style={{ ...styles.summaryCard, borderColor: "#fee2e2" }}>
                <span style={{ ...styles.summaryNum, color: "#dc2626" }}>
                  {failCount}
                </span>
                <span style={styles.summaryLabel}>Gagal</span>
              </div>
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: 80 }}>Status</th>
                    <th style={styles.th}>Nama Lama</th>
                    <th style={{ ...styles.th, width: 32 }}></th>
                    <th style={styles.th}>Nama Baru</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} style={styles.tr}>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            background:
                              r.status === "OK"
                                ? "#d1fae5"
                                : r.status === "SKIP"
                                  ? "#fef3c7"
                                  : "#fee2e2",
                            color:
                              r.status === "OK"
                                ? "#065f46"
                                : r.status === "SKIP"
                                  ? "#92400e"
                                  : "#991b1b",
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.fileOld}>{r.old_name}</span>
                      </td>
                      <td style={{ ...styles.td, textAlign: "center" }}>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#9ca3af"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.fileNew}>{r.new_name}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    height: "100vh",
    background: "#f9fafb",
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    fontSize: 14,
    color: "#111",
    overflow: "hidden",
  },
  sidebar: {
    width: 200,
    background: "white",
    borderRight: "1px solid #e5e7eb",
    display: "flex",
    flexDirection: "column",
    padding: "28px 20px",
    gap: 32,
    flexShrink: 0,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  brandIcon: {
    width: 34,
    height: 34,
    background: "#111",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    flexShrink: 0,
  },
  brandName: {
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.3,
    color: "#111",
    letterSpacing: "-0.01em",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 0",
  },
  navDot: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all 0.2s",
  },
  navLabel: {
    fontSize: 13,
    transition: "color 0.2s",
  },
  sidebarFooter: {
    marginTop: "auto",
  },
  folderBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 10px",
    background: "#f3f4f6",
    borderRadius: 8,
    color: "#6b7280",
  },
  folderBadgeText: {
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 120,
  },
  main: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
  },
  centerPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 24,
  },
  uploadZone: {
    width: "100%",
    maxWidth: 420,
    border: "1.5px dashed #d1d5db",
    borderRadius: 16,
    padding: "48px 32px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    background: "white",
    transition: "border-color 0.2s",
  },
  uploadIcon: {
    width: 56,
    height: 56,
    background: "#f3f4f6",
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#111",
    margin: 0,
  },
  uploadSub: {
    fontSize: 13,
    color: "#9ca3af",
    margin: 0,
    textAlign: "center",
  },
  hint: {
    maxWidth: 420,
    width: "100%",
    padding: "14px 18px",
    background: "#f9fafb",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
  },
  hintText: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 1.6,
    margin: 0,
  },
  code: {
    fontFamily: "monospace",
    fontSize: 11,
    background: "#e5e7eb",
    padding: "1px 5px",
    borderRadius: 4,
    color: "#374151",
  },
  pane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: 32,
    gap: 20,
    minHeight: 0,
  },
  paneHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  paneTitle: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
    letterSpacing: "-0.02em",
  },
  paneSub: {
    fontSize: 13,
    color: "#6b7280",
    margin: "4px 0 0",
  },
  headerActions: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  tableWrap: {
    flex: 1,
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    overflow: "auto",
    minHeight: 0,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left" as const,
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
    whiteSpace: "nowrap" as const,
  },
  tr: {
    cursor: "pointer",
    transition: "background 0.1s",
    borderBottom: "1px solid #f3f4f6",
  },
  td: {
    padding: "10px 14px",
    verticalAlign: "middle" as const,
  },
  fileOld: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#6b7280",
    wordBreak: "break-all" as const,
  },
  fileNew: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#059669",
    fontWeight: 600,
    wordBreak: "break-all" as const,
  },
  checkbox: {
    width: 15,
    height: 15,
    cursor: "pointer",
    accentColor: "#111",
  },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
  },
  summaryRow: {
    display: "flex",
    gap: 12,
    flexShrink: 0,
  },
  summaryCard: {
    flex: 1,
    background: "white",
    border: "1.5px solid",
    borderRadius: 12,
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  summaryNum: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.03em",
    lineHeight: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  btnPrimary: {
    background: "#111",
    color: "white",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.2s",
    whiteSpace: "nowrap" as const,
  },
  btnSecondary: {
    background: "transparent",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
};
