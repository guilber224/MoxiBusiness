// ╔══════════════════════════════════════════════════════════════════════╗
// ║  EXCEL EXPORT                                                       ║
// ╚══════════════════════════════════════════════════════════════════════╝
export async function xlsx(sheets, filename) {
  // xlsx (SheetJS) se carga solo cuando se exporta un reporte — evita inflar el bundle inicial.
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, data }) => { const ws = XLSX.utils.json_to_sheet(data); XLSX.utils.book_append_sheet(wb, ws, name); });
  const mobileSave = window.MoxiAndroid?.saveBase64File || window.AjiAndroid?.saveBase64File;
  if (mobileSave) {
    const base64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
    mobileSave(
      filename,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64
    );
    return;
  }
  XLSX.writeFile(wb, filename);
}
