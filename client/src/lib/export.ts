export function exportToCSV(data: Record<string, any>[], filename: string) {
  if (!data.length) {
    alert("No data to export.");
    return;
  }
  const headers = Object.keys(data[0]);
  const escape = (val: any) => {
    const str = String(val ?? "");
    const clean = str.replace(/"/g, '""');
    return clean.includes(",") || clean.includes('"') || clean.includes("\n")
      ? `"${clean}"`
      : clean;
  };
  const csvContent = [
    headers.join(","),
    ...data.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
