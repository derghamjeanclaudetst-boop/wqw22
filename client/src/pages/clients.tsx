import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client, WorkOrder } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Building2, Plus, Search, Edit2, Trash2, Phone, Mail, MapPin,
  ClipboardList, DollarSign, Calendar, X, ChevronRight, TrendingUp
} from "lucide-react";
import { getStatusBadgeClass, getStatusInfo } from "@/lib/work-order-statuses";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClientStats {
  totalPaid: number;
  byYear: { year: number; total: number }[];
  byMonth: { month: string; total: number }[];
  byDay: { date: string; total: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const fmtMonth = (s: string) => {
  const [y, m] = s.split("-");
  return new Date(+y, +m - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

const fmtDay = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-US", {
  weekday: "short", year: "numeric", month: "short", day: "numeric",
});

// ─── Client Form ──────────────────────────────────────────────────────────────
interface ClientFormData {
  name: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  street: string;
  zipCode: string;
  notes: string;
}

const emptyForm = (): ClientFormData => ({
  name: "", phone: "", email: "", city: "", state: "", street: "", zipCode: "", notes: "",
});

function ClientFormModal({
  isOpen, onClose, client,
}: {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ClientFormData>(
    client
      ? { name: client.name, phone: client.phone ?? "", email: client.email ?? "",
          city: client.city ?? "", state: (client as any).state ?? "", street: client.street ?? "",
          zipCode: client.zipCode ?? "", notes: client.notes ?? "" }
      : emptyForm()
  );

  const set = (k: keyof ClientFormData, v: string) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: ClientFormData) =>
      client
        ? apiRequest("PUT", `/api/clients/${client.id}`, data)
        : apiRequest("POST", "/api/clients", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: client ? "Client updated" : "Client created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    mutation.mutate(form);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{client ? "Edit Client" : "Add New Client"}</DialogTitle>
          <DialogDescription>
            {client ? "Update client details." : "Enter the details for the new client."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Full name or company" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+1-555-0123" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="client@example.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="City" />
            </div>
            <div>
              <Label>State</Label>
              <Input value={form.state} onChange={e => set("state", e.target.value)} placeholder="State / Province" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Label>Street</Label>
              <Input value={form.street} onChange={e => set("street", e.target.value)} placeholder="Street address" />
            </div>
            <div>
              <Label>ZIP Code</Label>
              <Input value={form.zipCode} onChange={e => set("zipCode", e.target.value)} placeholder="12345" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any additional notes..." rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : client ? "Update Client" : "Create Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Client History Modal ─────────────────────────────────────────────────────
function ClientHistoryModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const { data: workOrders = [], isLoading: woLoading } = useQuery<WorkOrder[]>({
    queryKey: ["/api/clients", client.id, "work-orders"],
    queryFn: () => apiRequest("GET", `/api/clients/${client.id}/work-orders`).then(r => r.json()),
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ClientStats>({
    queryKey: ["/api/clients", client.id, "stats"],
    queryFn: () => apiRequest("GET", `/api/clients/${client.id}/stats`).then(r => r.json()),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            {client.name} — History
          </DialogTitle>
          <DialogDescription>
            All work orders and payment totals for this client.
          </DialogDescription>
        </DialogHeader>

        {/* Payment Summary Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 text-white">
          <div className="flex items-center gap-3">
            <DollarSign className="h-8 w-8 opacity-80" />
            <div>
              <p className="text-blue-100 text-sm">Total Received (Approved Invoices)</p>
              <p className="text-3xl font-bold">
                {statsLoading ? "…" : fmt(stats?.totalPaid ?? 0)}
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="work-orders">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="work-orders">
              <ClipboardList className="h-4 w-4 mr-1" /> Work Orders
            </TabsTrigger>
            <TabsTrigger value="by-year">
              <TrendingUp className="h-4 w-4 mr-1" /> By Year
            </TabsTrigger>
            <TabsTrigger value="by-month">
              <Calendar className="h-4 w-4 mr-1" /> By Month
            </TabsTrigger>
            <TabsTrigger value="by-day">
              <Calendar className="h-4 w-4 mr-1" /> By Day
            </TabsTrigger>
          </TabsList>

          {/* Work Orders Tab */}
          <TabsContent value="work-orders">
            {woLoading ? (
              <div className="text-center py-8 text-gray-400">Loading…</div>
            ) : workOrders.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>No work orders found for this client.</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>WO #</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead className="text-right">NTE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrders.map(wo => (
                      <TableRow key={wo.id}>
                        <TableCell className="font-mono text-sm font-medium text-blue-600">
                          {wo.workOrderNumber}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate">{wo.description}</TableCell>
                        <TableCell>
                          <Badge className={getStatusBadgeClass(wo.status)}>
                            {getStatusInfo(wo.status).label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {wo.startDate || "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {wo.nte ? fmt(parseFloat(wo.nte)) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* By Year Tab */}
          <TabsContent value="by-year">
            {statsLoading ? (
              <div className="text-center py-8 text-gray-400">Loading…</div>
            ) : !stats?.byYear.length ? (
              <div className="text-center py-8 text-gray-400">No payment data yet.</div>
            ) : (
              <div className="space-y-3">
                {stats.byYear.map(r => (
                  <div key={r.year} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-blue-600" />
                      </div>
                      <span className="font-semibold text-lg">{r.year}</span>
                    </div>
                    <span className="text-xl font-bold text-green-600">{fmt(r.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* By Month Tab */}
          <TabsContent value="by-month">
            {statsLoading ? (
              <div className="text-center py-8 text-gray-400">Loading…</div>
            ) : !stats?.byMonth.length ? (
              <div className="text-center py-8 text-gray-400">No payment data yet.</div>
            ) : (
              <div className="space-y-2">
                {stats.byMonth.map(r => (
                  <div key={r.month} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{fmtMonth(r.month)}</span>
                    </div>
                    <span className="font-bold text-green-600">{fmt(r.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* By Day Tab */}
          <TabsContent value="by-day">
            {statsLoading ? (
              <div className="text-center py-8 text-gray-400">Loading…</div>
            ) : !stats?.byDay.length ? (
              <div className="text-center py-8 text-gray-400">No payment data yet.</div>
            ) : (
              <div className="space-y-2">
                {stats.byDay.map(r => (
                  <div key={r.date} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{fmtDay(r.date)}</span>
                    </div>
                    <span className="font-bold text-green-600">{fmt(r.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Clients Page ────────────────────────────────────────────────────────
export default function ClientsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Client | null>(null);

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/clients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client deleted" });
      setDeleteConfirm(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search) ||
    (c.city ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setEditClient(null); setFormOpen(true); };
  const openEdit = (c: Client) => { setEditClient(c); setFormOpen(true); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-7 w-7 text-blue-600" />
            Client Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage your clients and view their work order history &amp; payment totals.
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Client
        </Button>
      </div>

      {/* Search + Stats bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search by name, email, phone, city…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
        <div className="text-sm text-gray-500">
          {filtered.length} client{filtered.length !== 1 ? "s" : ""}
          {search ? ` matching "${search}"` : " total"}
        </div>
      </div>

      {/* Client Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-44 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Building2 className="h-14 w-14 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400">
            {search ? "No clients match your search" : "No clients yet"}
          </h3>
          {!search && (
            <Button onClick={openAdd} className="mt-4 gap-2" variant="outline">
              <Plus className="h-4 w-4" /> Add your first client
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(client => (
            <Card key={client.id} className="group relative hover:shadow-md transition-shadow border">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                      <span className="text-blue-700 dark:text-blue-300 font-bold text-sm">
                        {client.name.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <CardTitle className="text-base truncate">{client.name}</CardTitle>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(client)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700"
                      onClick={() => setDeleteConfirm(client)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {client.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {client.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>
                )}
                {(client.city || (client as any).state) && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {[client.city, (client as any).state].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    variant="outline"
                    className="w-full gap-2 text-sm h-8"
                    onClick={() => setHistoryClient(client)}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    View History & Payments
                    <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {formOpen && (
        <ClientFormModal
          isOpen={formOpen}
          onClose={() => { setFormOpen(false); setEditClient(null); }}
          client={editClient}
        />
      )}

      {/* History Modal */}
      {historyClient && (
        <ClientHistoryModal
          client={historyClient}
          onClose={() => setHistoryClient(null)}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Dialog open onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Delete Client</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
                Their work orders will not be deleted but will be unlinked from this client.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete Client"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
