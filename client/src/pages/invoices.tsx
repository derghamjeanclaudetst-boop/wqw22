import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Edit, Trash2, Receipt, Search, Filter, Lock, Download, Printer } from "lucide-react";
import { exportToCSV } from "@/lib/export";
import { CreateInvoiceModal } from "@/components/modals/create-invoice-modal";
import { PageGuard, ButtonGuard } from "@/components/rbac/advanced-permission-guard";
import { printInvoice } from "@/lib/print-utils";
import { useSystemSettings } from "@/contexts/system-settings";
import type { WorkOrderInvoice, WorkOrder } from "@shared/schema";

interface InvoiceWithWorkOrder extends WorkOrderInvoice {
  workOrderNumber: string;
  clientName: string;
  isLocked?: boolean;
}

export default function Invoices() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceWithWorkOrder | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { systemName, logoUrl } = useSystemSettings();
  const { t } = useTranslation();

  // Fetch all invoices with work order details
  const { data: invoices = [], isLoading } = useQuery<InvoiceWithWorkOrder[]>({
    queryKey: ["/api/invoices/all"],
    refetchInterval: 2000, // Refresh every 2 seconds to show new invoices
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ invoiceId, data }: { invoiceId: number; data: any }) => {
      const response = await apiRequest("PATCH", `/api/invoices/${invoiceId}`, data);
      return response.json();
    },
    onSuccess: (updatedInvoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      
      // Show success message with lock notification if status changed to paid
      if (updatedInvoice.status === "paid") {
        toast({
          title: "Invoice Updated & Work Order Locked",
          description: "Invoice marked as paid. Work order is now locked from editing.",
        });
      } else {
        toast({
          title: "Invoice Updated",
          description: "Invoice has been updated successfully.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update invoice",
        variant: "destructive",
      });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await apiRequest("DELETE", `/api/invoices/${invoiceId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({
        title: "Invoice Deleted",
        description: "Invoice has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete invoice",
        variant: "destructive",
      });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/invoices", {
        ...data,
        workOrderId: 1, // For now, we'll use work order 1 as default
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      setIsCreateModalOpen(false);
      toast({
        title: "Invoice Created",
        description: "Invoice has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create invoice",
        variant: "destructive",
      });
    },
  });

  // Filter invoices based on search and status
  const filteredInvoices = (invoices as InvoiceWithWorkOrder[]).filter((invoice: InvoiceWithWorkOrder) => {
    const matchesSearch = 
      invoice.workOrderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.clientName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string, isLocked?: boolean) => {
    const statusConfig = {
      draft: { color: "bg-gray-500", text: "Draft" },
      sent: { color: "bg-blue-500", text: "Sent" },
      paid: { color: "bg-green-500", text: "Paid" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    
    return (
      <div className="flex items-center gap-2">
        <Badge className={`${config.color} text-white`}>
          {config.text}
        </Badge>
        {isLocked && (
          <Badge variant="secondary" className="bg-red-100 text-red-800">
            <Lock className="h-3 w-3 mr-1" />
            Locked
          </Badge>
        )}
      </div>
    );
  };

  const handleEdit = (invoice: InvoiceWithWorkOrder) => {
    if (invoice.isLocked) {
      toast({
        title: "Cannot Edit",
        description: "This invoice is locked because the work order has been paid.",
        variant: "destructive",
      });
      return;
    }
    setEditingInvoice(invoice);
    setIsCreateModalOpen(true);
  };

  const handleDelete = (invoice: InvoiceWithWorkOrder) => {
    if (invoice.isLocked) {
      toast({
        title: "Cannot Delete",
        description: "This invoice is locked because the work order has been paid.",
        variant: "destructive",
      });
      return;
    }
    
    if (confirm("Are you sure you want to delete this invoice?")) {
      deleteInvoiceMutation.mutate(invoice.id);
    }
  };

  const handleStatusChange = (invoice: InvoiceWithWorkOrder, newStatus: string) => {
    if (invoice.isLocked && newStatus !== "paid") {
      toast({
        title: "Cannot Change Status",
        description: "This invoice is locked. Only status changes to 'paid' are allowed.",
        variant: "destructive",
      });
      return;
    }

    // Special handling for changing to "paid" status
    if (newStatus === "paid") {
      if (confirm(`Are you sure you want to mark this invoice as PAID? This will lock the work order ${invoice.workOrderNumber} from all future edits.`)) {
        updateInvoiceMutation.mutate({
          invoiceId: invoice.id,
          data: { status: newStatus },
        });
      }
    } else {
      updateInvoiceMutation.mutate({
        invoiceId: invoice.id,
        data: { status: newStatus },
      });
    }
  };

  const handleModalSubmit = (data: any) => {
    if (editingInvoice) {
      updateInvoiceMutation.mutate({
        invoiceId: editingInvoice.id,
        data,
      });
    } else {
      createInvoiceMutation.mutate(data);
    }
  };

  const handleModalClose = () => {
    setIsCreateModalOpen(false);
    setEditingInvoice(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <PageGuard pageName="invoices">
      <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t("invoices.title")}</h1>
          <p className="text-gray-600">{t("invoices.title")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const rows = filteredInvoices.map((inv) => ({
                "Invoice #": inv.invoiceNumber || inv.id,
                "Work Order #": inv.workOrderNumber,
                "Client": inv.clientName,
                "Labor Cost ($)": parseFloat(inv.laborCost || "0").toFixed(2),
                "Material Cost ($)": parseFloat(inv.materialCost || "0").toFixed(2),
                "Tax Rate (%)": parseFloat(inv.taxRate || "0").toFixed(1),
                "Tax Amount ($)": parseFloat(inv.taxAmount || "0").toFixed(2),
                "Total ($)": parseFloat(inv.totalAmount || "0").toFixed(2),
                Status: inv.status,
                Locked: inv.isLocked ? "Yes" : "No",
                Created: new Date(inv.createdAt).toLocaleDateString(),
                Notes: inv.notes || "",
              }));
              exportToCSV(rows, "invoices");
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            {t("invoices.exportCSV")}
          </Button>
          <ButtonGuard permission="invoices.create">
            <Button 
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Receipt className="h-4 w-4 mr-2" />
              {t("invoices.createInvoice")}
            </Button>
          </ButtonGuard>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by work order number or client name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Invoices ({filteredInvoices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">No Invoices Found</h3>
              <p className="text-gray-600 mb-6">
                {searchTerm || statusFilter !== "all" 
                  ? "No invoices match your current filters."
                  : "Create your first invoice to get started with ABC Corporation billing."
                }
              </p>
              {!searchTerm && statusFilter === "all" && (
                <Button onClick={() => setIsCreateModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                  <Receipt className="h-4 w-4 mr-2" />
                  Create First Invoice
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("invoices.workOrder")}</TableHead>
                    <TableHead>{t("invoices.client")}</TableHead>
                    <TableHead>{t("invoices.laborCost")}</TableHead>
                    <TableHead>{t("invoices.materialCost")}</TableHead>
                    <TableHead>{t("invoices.taxRate")}</TableHead>
                    <TableHead>{t("invoices.totalAmount")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice: InvoiceWithWorkOrder) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {invoice.workOrderNumber}
                      </TableCell>
                      <TableCell>{invoice.clientName}</TableCell>
                      <TableCell>${parseFloat(invoice.laborCost || "0").toFixed(2)}</TableCell>
                      <TableCell>${parseFloat(invoice.materialCost || "0").toFixed(2)}</TableCell>
                      <TableCell>{parseFloat(invoice.taxRate || "0").toFixed(1)}%</TableCell>
                      <TableCell className="font-medium text-blue-600">
                        ${parseFloat(invoice.totalAmount || "0").toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(invoice.status || "draft", invoice.isLocked)}
                          {!invoice.isLocked && (
                            <Select
                              value={invoice.status || "draft"}
                              onValueChange={(value) => handleStatusChange(invoice, value)}
                              disabled={updateInvoiceMutation.isPending}
                            >
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="sent">Sent</SelectItem>
                                <SelectItem value="paid">Paid</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(invoice.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            title="Print / Save as PDF"
                            onClick={() => printInvoice({ systemName, logoUrl, invoice })}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <ButtonGuard permission="invoices.edit">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(invoice)}
                              disabled={invoice.isLocked}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </ButtonGuard>
                          <ButtonGuard permission="invoices.delete">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(invoice)}
                              disabled={invoice.isLocked || deleteInvoiceMutation.isPending}
                              className="text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </ButtonGuard>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Invoice Modal */}
      <CreateInvoiceModal
        isOpen={isCreateModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        isLoading={createInvoiceMutation.isPending || updateInvoiceMutation.isPending}
        initialData={editingInvoice}
        mode={editingInvoice ? "edit" : "create"}
        workOrderId={editingInvoice?.workOrderId}
      />
      </div>
    </PageGuard>
  );
}