// ─── Print / PDF utility ────────────────────────────────────────────────────
// Opens a new window with the rendered HTML and immediately calls print().
// The browser's "Save as PDF" option in the print dialog produces the PDF.

function fmt(n: string | number | null | undefined, decimals = 2): string {
  const v = parseFloat(String(n ?? 0));
  return isNaN(v) ? "0.00" : v.toFixed(decimals);
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return String(d); }
}

function statusPill(status: string): string {
  const colors: Record<string, string> = {
    pending: "#f59e0b", approved: "#10b981", rejected: "#ef4444",
    draft: "#6b7280", sent: "#3b82f6", paid: "#10b981",
  };
  const c = colors[status?.toLowerCase()] ?? "#6b7280";
  return `<span style="background:${c};color:#fff;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${status}</span>`;
}

function tableRow(...cells: string[]): string {
  return `<tr>${cells.map(c => `<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${c}</td>`).join("")}</tr>`;
}

function tableHead(...cells: string[]): string {
  return `<tr>${cells.map(c => `<th style="padding:8px 12px;text-align:left;background:#1e293b;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.05em">${c}</th>`).join("")}</tr>`;
}

function totalsRow(label: string, value: string, bold = false): string {
  const style = bold
    ? "padding:10px 12px;font-weight:700;font-size:15px;border-top:2px solid #1e293b"
    : "padding:8px 12px;color:#475569";
  return `<tr>
    <td colspan="3" style="${style};text-align:right">${label}</td>
    <td style="${style};text-align:right;min-width:110px">$${value}</td>
  </tr>`;
}

function baseHtml(title: string, systemName: string, logoUrl: string, body: string): string {
  const logo = logoUrl
    ? `<img src="${logoUrl}" style="height:48px;width:48px;object-fit:contain;border-radius:12px" />`
    : `<div style="height:48px;width:48px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border-radius:12px;display:flex;align-items:center;justify-content:center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M12 1a5 5 0 0 1 5 5v1h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2V6a5 5 0 0 1 5-5zm0 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0-8a3 3 0 0 0-3 3v1h6V6a3 3 0 0 0-3-3z"/></svg>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1e293b; background: #fff; }
  table { width: 100%; border-collapse: collapse; }
  .page { max-width: 820px; margin: 0 auto; padding: 36px 40px; }
  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 24px; border-bottom: 3px solid #1e293b; margin-bottom: 28px; }
  .company { display: flex; align-items: center; gap: 14px; }
  .company-name { font-size: 22px; font-weight: 800; color: #1e293b; }
  .doc-type { text-align: right; }
  .doc-type-label { font-size: 32px; font-weight: 900; color: #1e293b; letter-spacing: -.5px; }
  .doc-type-num { font-size: 13px; color: #64748b; margin-top: 4px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .meta-item { display: flex; flex-direction: column; gap: 2px; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; font-weight: 600; }
  .meta-value { font-size: 13px; color: #1e293b; font-weight: 500; }
  .data-table { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
  .data-table table { font-size: 12px; }
  .totals-table { margin-left: auto; width: 340px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .totals-table table { font-size: 13px; }
  .grand-total-row { background: #1e293b; color: #fff; }
  .grand-total-row td { color: #fff !important; padding: 12px; font-size: 16px; font-weight: 800; }
  .notes-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; font-size: 13px; color: #475569; line-height: 1.6; }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; }
  .sig-line { border-top: 1px solid #1e293b; padding-top: 6px; min-width: 200px; font-size: 11px; color: #64748b; }
  .watermark { position: fixed; bottom: 12px; right: 16px; font-size: 10px; color: #cbd5e1; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 20px 28px; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="company">
      ${logo}
      <div>
        <div class="company-name">${systemName}</div>
        <div style="font-size:11px;color:#64748b">Maintenance Management System</div>
      </div>
    </div>
    <div class="doc-type">${body.split("<!--DOC_TYPE-->")[0]}</div>
  </div>
  ${body.split("<!--DOC_TYPE-->").slice(1).join("")}
</div>
<div class="watermark">Generated by ${systemName} · ${new Date().toLocaleDateString()}</div>
</body>
</html>`;
}

// ─── Proposal Print ──────────────────────────────────────────────────────────

interface LaborEntry { transactionDate: string; payRate: string; regularHours: string; otHours: string; otScale: string; remark: string; }
interface PartsEntry { transactionDate: string; unitCost: string; quantity: string; remark: string; }
interface ServicesEntry { transactionDate: string; transactionType: string; unitCost: string; quantity: string; remark: string; }

interface ProposalPrintData {
  systemName: string;
  logoUrl: string;
  proposal: {
    id: number;
    status: string;
    createdAt: string | Date;
    totalCost: string | number | null;
    laborCost: string | number | null;
    materialCost: string | number | null;
    additionalCosts: string | number | null;
    estimatedDuration?: string | null;
    message?: string | null;
    laborData?: string | null;
    partsData?: string | null;
    servicesData?: string | null;
  };
  workOrder: {
    title: string;
    workOrderNumber: string;
    category: string;
    location: string;
    description?: string | null;
    nte?: number | null;
    requestedByUser?: { firstName?: string; lastName?: string } | null;
  };
}

export function printProposal(data: ProposalPrintData) {
  const { systemName, logoUrl, proposal, workOrder } = data;

  let laborEntries: LaborEntry[] = [];
  let partsEntries: PartsEntry[] = [];
  let servicesEntries: ServicesEntry[] = [];
  try { laborEntries = proposal.laborData ? JSON.parse(proposal.laborData) : []; } catch {}
  try { partsEntries = proposal.partsData ? JSON.parse(proposal.partsData) : []; } catch {}
  try { servicesEntries = proposal.servicesData ? JSON.parse(proposal.servicesData) : []; } catch {}

  const laborTotal = laborEntries.reduce((s, e) => {
    const rate = parseFloat(e.payRate) || 0;
    const reg = parseFloat(e.regularHours) || 0;
    const ot = parseFloat(e.otHours) || 0;
    const scale = parseFloat(e.otScale) || 1.5;
    return s + (rate * reg) + (rate * scale * ot);
  }, 0);

  const partsTotal = partsEntries.reduce((s, e) =>
    s + (parseFloat(e.unitCost) || 0) * (parseFloat(e.quantity) || 0), 0);

  const servicesTotal = servicesEntries.reduce((s, e) =>
    s + (parseFloat(e.unitCost) || 0) * (parseFloat(e.quantity) || 0), 0);

  const grandTotal = parseFloat(String(proposal.totalCost)) || (laborTotal + partsTotal + servicesTotal);

  const laborTable = laborEntries.length
    ? `<div class="data-table"><table>
        <thead>${tableHead("Date", "Remark / Description", "Reg Hrs", "OT Hrs", "Rate", "OT Scale", "Amount")}</thead>
        <tbody>
          ${laborEntries.map(e => {
            const reg = parseFloat(e.regularHours) || 0;
            const ot = parseFloat(e.otHours) || 0;
            const rate = parseFloat(e.payRate) || 0;
            const scale = parseFloat(e.otScale) || 1.5;
            const amt = (rate * reg) + (rate * scale * ot);
            return tableRow(e.transactionDate, e.remark || "—", String(reg), String(ot), `$${fmt(rate)}`, `${scale}x`, `$${fmt(amt)}`);
          }).join("")}
        </tbody>
      </table></div>`
    : `<p style="color:#94a3b8;font-size:12px;padding:8px 0">No labor entries</p>`;

  const partsTable = partsEntries.length
    ? `<div class="data-table"><table>
        <thead>${tableHead("Date", "Description", "Qty", "Unit Cost", "Total")}</thead>
        <tbody>
          ${partsEntries.map(e => {
            const qty = parseFloat(e.quantity) || 0;
            const cost = parseFloat(e.unitCost) || 0;
            return tableRow(e.transactionDate, e.remark || "—", String(qty), `$${fmt(cost)}`, `$${fmt(qty * cost)}`);
          }).join("")}
        </tbody>
      </table></div>`
    : `<p style="color:#94a3b8;font-size:12px;padding:8px 0">No parts entries</p>`;

  const servicesTable = servicesEntries.length
    ? `<div class="data-table"><table>
        <thead>${tableHead("Date", "Type", "Description", "Qty", "Unit Cost", "Total")}</thead>
        <tbody>
          ${servicesEntries.map(e => {
            const qty = parseFloat(e.quantity) || 0;
            const cost = parseFloat(e.unitCost) || 0;
            return tableRow(e.transactionDate, e.transactionType || "—", e.remark || "—", String(qty), `$${fmt(cost)}`, `$${fmt(qty * cost)}`);
          }).join("")}
        </tbody>
      </table></div>`
    : `<p style="color:#94a3b8;font-size:12px;padding:8px 0">No services entries</p>`;

  const docTypeBlock = `
    <div class="doc-type-label">PROPOSAL</div>
    <div class="doc-type-num">${workOrder.workOrderNumber}</div>
    <div style="margin-top:8px">${statusPill(proposal.status)}</div>`;

  const body = `${docTypeBlock}<!--DOC_TYPE-->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px">
    <div class="section">
      <div class="section-title">Work Order Details</div>
      <div class="meta-grid">
        <div class="meta-item"><span class="meta-label">Work Order #</span><span class="meta-value">${workOrder.workOrderNumber}</span></div>
        <div class="meta-item"><span class="meta-label">Category</span><span class="meta-value">${workOrder.category}</span></div>
        <div class="meta-item"><span class="meta-label">Date Issued</span><span class="meta-value">${fmtDate(proposal.createdAt)}</span></div>
        <div class="meta-item"><span class="meta-label">Est. Duration</span><span class="meta-value">${proposal.estimatedDuration || "TBD"}</span></div>
        <div class="meta-item" style="grid-column:1/-1"><span class="meta-label">Title</span><span class="meta-value">${workOrder.title}</span></div>
        <div class="meta-item" style="grid-column:1/-1"><span class="meta-label">Location</span><span class="meta-value">${workOrder.location}</span></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Proposal Info</div>
      <div class="meta-grid">
        <div class="meta-item"><span class="meta-label">Status</span><span class="meta-value">${proposal.status?.toUpperCase()}</span></div>
        <div class="meta-item"><span class="meta-label">NTE Budget</span><span class="meta-value">${workOrder.nte ? "$" + workOrder.nte.toLocaleString() : "Not set"}</span></div>
        <div class="meta-item"><span class="meta-label">Requested By</span><span class="meta-value">${workOrder.requestedByUser ? (workOrder.requestedByUser.firstName + " " + workOrder.requestedByUser.lastName).trim() : "—"}</span></div>
        <div class="meta-item"><span class="meta-label">Proposal #</span><span class="meta-value">PROP-${String(proposal.id).padStart(5, "0")}</span></div>
      </div>
    </div>
  </div>

  ${workOrder.description ? `<div class="section">
    <div class="section-title">Scope of Work</div>
    <div class="notes-box">${workOrder.description}</div>
  </div>` : ""}

  <div class="section">
    <div class="section-title">Labor</div>
    ${laborTable}
  </div>

  <div class="section">
    <div class="section-title">Parts &amp; Materials</div>
    ${partsTable}
  </div>

  <div class="section">
    <div class="section-title">Services &amp; Other</div>
    ${servicesTable}
  </div>

  <div style="display:flex;justify-content:flex-end;margin-bottom:24px">
    <div class="totals-table">
      <table>
        <tbody>
          ${totalsRow("Labor Total", fmt(laborTotal))}
          ${totalsRow("Parts & Materials Total", fmt(partsTotal))}
          ${totalsRow("Services & Other Total", fmt(servicesTotal))}
        </tbody>
        <tfoot>
          <tr class="grand-total-row">
            <td colspan="3" style="text-align:right;padding:12px;font-weight:800;font-size:15px">TOTAL</td>
            <td style="text-align:right;padding:12px;font-weight:800;font-size:15px;min-width:120px">$${fmt(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  ${proposal.message ? `<div class="section">
    <div class="section-title">Notes &amp; Message</div>
    <div class="notes-box">${proposal.message}</div>
  </div>` : ""}

  <div class="footer">
    <div>
      <div class="sig-line">Authorized Signature</div>
    </div>
    <div>
      <div class="sig-line">Client Acceptance &amp; Date</div>
    </div>
    <div style="text-align:right;font-size:11px;color:#94a3b8">
      <div>Proposal PROP-${String(proposal.id).padStart(5, "0")}</div>
      <div>${fmtDate(proposal.createdAt)}</div>
    </div>
  </div>`;

  openPrintWindow(`Proposal — ${workOrder.workOrderNumber}`, systemName, logoUrl, body);
}

// ─── Invoice Print ───────────────────────────────────────────────────────────

interface InvoicePrintData {
  systemName: string;
  logoUrl: string;
  invoice: {
    id: number;
    invoiceNumber: string;
    laborCost: string | number | null;
    materialCost: string | number | null;
    additionalCosts?: string | number | null;
    subtotal?: string | number | null;
    taxRate: string | number | null;
    taxAmount: string | number | null;
    totalAmount: string | number | null;
    status: string;
    notes?: string | null;
    createdAt: string | Date;
    sentAt?: string | Date | null;
    paidAt?: string | Date | null;
    clientName: string;
    workOrderNumber: string;
  };
}

export function printInvoice(data: InvoicePrintData) {
  const { systemName, logoUrl, invoice } = data;

  const labor = parseFloat(String(invoice.laborCost)) || 0;
  const material = parseFloat(String(invoice.materialCost)) || 0;
  const additional = parseFloat(String(invoice.additionalCosts)) || 0;
  const subtotal = parseFloat(String(invoice.subtotal)) || (labor + material + additional);
  const taxRate = parseFloat(String(invoice.taxRate)) || 0;
  const taxAmount = parseFloat(String(invoice.taxAmount)) || 0;
  const total = parseFloat(String(invoice.totalAmount)) || 0;

  const taxPct = taxRate < 1 ? (taxRate * 100).toFixed(1) : taxRate.toFixed(1);

  const lineItems = [
    { desc: "Labor", amount: labor },
    { desc: "Materials & Parts", amount: material },
    ...(additional > 0 ? [{ desc: "Additional Costs", amount: additional }] : []),
  ];

  const docTypeBlock = `
    <div class="doc-type-label">INVOICE</div>
    <div class="doc-type-num"># ${invoice.invoiceNumber}</div>
    <div style="margin-top:8px">${statusPill(invoice.status)}</div>`;

  const body = `${docTypeBlock}<!--DOC_TYPE-->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px">
    <div class="section">
      <div class="section-title">Bill To</div>
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:4px">${invoice.clientName}</div>
      <div style="font-size:12px;color:#64748b">Work Order: ${invoice.workOrderNumber}</div>
    </div>
    <div class="section">
      <div class="section-title">Invoice Details</div>
      <div class="meta-grid">
        <div class="meta-item"><span class="meta-label">Invoice #</span><span class="meta-value">${invoice.invoiceNumber}</span></div>
        <div class="meta-item"><span class="meta-label">Status</span><span class="meta-value">${invoice.status?.toUpperCase()}</span></div>
        <div class="meta-item"><span class="meta-label">Date Issued</span><span class="meta-value">${fmtDate(invoice.createdAt)}</span></div>
        ${invoice.sentAt ? `<div class="meta-item"><span class="meta-label">Date Sent</span><span class="meta-value">${fmtDate(invoice.sentAt)}</span></div>` : ""}
        ${invoice.paidAt ? `<div class="meta-item"><span class="meta-label">Date Paid</span><span class="meta-value">${fmtDate(invoice.paidAt)}</span></div>` : ""}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Line Items</div>
    <div class="data-table">
      <table>
        <thead>${tableHead("#", "Description", "Amount")}</thead>
        <tbody>
          ${lineItems.map((item, i) => `<tr>
            <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#94a3b8;width:36px">${i + 1}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${item.desc}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:500">$${fmt(item.amount)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>

  <div style="display:flex;justify-content:flex-end;margin-bottom:24px">
    <div class="totals-table">
      <table>
        <tbody>
          <tr><td colspan="3" style="padding:8px 12px;color:#475569;text-align:right">Subtotal</td><td style="padding:8px 12px;text-align:right;min-width:110px">$${fmt(subtotal)}</td></tr>
          <tr><td colspan="3" style="padding:8px 12px;color:#475569;text-align:right">Tax (${taxPct}%)</td><td style="padding:8px 12px;text-align:right">$${fmt(taxAmount)}</td></tr>
        </tbody>
        <tfoot>
          <tr class="grand-total-row">
            <td colspan="3" style="text-align:right;padding:12px;font-weight:800;font-size:15px">TOTAL DUE</td>
            <td style="text-align:right;padding:12px;font-weight:800;font-size:15px;min-width:120px">$${fmt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  ${invoice.notes ? `<div class="section">
    <div class="section-title">Notes</div>
    <div class="notes-box">${invoice.notes}</div>
  </div>` : ""}

  <div class="footer">
    <div>
      <div class="sig-line">Authorized Signature</div>
    </div>
    <div>
      <div class="sig-line">Received By &amp; Date</div>
    </div>
    <div style="text-align:right;font-size:11px;color:#94a3b8">
      <div>Invoice # ${invoice.invoiceNumber}</div>
      <div>Thank you for your business</div>
    </div>
  </div>`;

  openPrintWindow(`Invoice — ${invoice.invoiceNumber}`, systemName, logoUrl, body);
}

// ─── Core: open popup and trigger print ─────────────────────────────────────

function openPrintWindow(title: string, systemName: string, logoUrl: string, body: string) {
  const html = baseHtml(title, systemName, logoUrl, body);
  const w = window.open("", "_blank", "width=900,height=700,scrollbars=yes,resizable=yes");
  if (!w) { alert("Please allow pop-ups for this site to print documents."); return; }
  w.document.write(html);
  w.document.close();
  // Give images/styles a moment to load, then print
  w.onload = () => { w.focus(); w.print(); };
  setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 800);
}
