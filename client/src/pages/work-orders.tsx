import { useState, useEffect } from "react";
import { Plus, Calendar, DollarSign, User, MapPin, Eye, Edit, Trash2, FileText, Search, Filter, Download } from "lucide-react";
import { exportToCSV } from "@/lib/export";
import { getStatusBadgeClass, PRIMARY_STATUSES } from "@/lib/work-order-statuses";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdvancedPermissionGuard, PageGuard, ModalGuard, ButtonGuard } from "@/components/rbac/advanced-permission-guard";
import { CreateWorkOrderModal } from "@/components/modals/create-work-order-modal";
import { WorkOrderDetailsModal } from "@/components/modals/work-order-details-modal";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import type { WorkOrderWithUsers } from "@shared/schema";

export default function WorkOrders() {
  const { user, permissions } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrderWithUsers | null>(null);
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrderWithUsers | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: workOrders = [], isLoading, refetch } = useQuery<WorkOrderWithUsers[]>({
    queryKey: ["/api/work-orders"],
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewId = urlParams.get('viewId');
    if (viewId && workOrders) {
      const workOrder = workOrders.find(wo => wo.id === parseInt(viewId));
      if (workOrder) {
        setSelectedWorkOrder(workOrder);
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [workOrders]);

  const getStatusColor = (status: string) => {
    return getStatusBadgeClass(status);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(amount));
  };

  const categories = Array.from(new Set(workOrders.map(wo => wo.category))).filter(c => c && c.trim() !== '');
  const statuses = Array.from(new Set(workOrders.map(wo => wo.status))).filter(s => s && s.trim() !== '');

  const filteredWorkOrders = workOrders.filter(workOrder => {
    let hasPermission = false;
    if (permissions?.includes("workorders.view_all") || permissions?.includes("workorders.page.view") || permissions?.includes("system.admin")) {
      hasPermission = true;
    } else {
      try {
        const assignedUserIds = workOrder.assignedUsers ? workOrder.assignedUsers.map(u => u.id) : [];
        hasPermission = assignedUserIds.includes(user?.id || 0);
      } catch { hasPermission = false; }
    }
    if (!hasPermission) return false;
    const matchesSearch = !searchTerm ||
      workOrder.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      workOrder.workOrderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      workOrder.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      workOrder.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || workOrder.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || workOrder.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  return (
    <PageGuard pageName="workorders">
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{t("workOrders.title")}</h1>
              <p className="mt-2 text-sm text-gray-600">
                {t("workOrders.noWorkOrdersDesc")}
              </p>
            </div>
            <ModalGuard modalName="workorders" operation="create">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const rows = filteredWorkOrders.map((wo) => ({
                      "Work Order #": wo.workOrderNumber,
                      Title: wo.title,
                      Status: wo.status,
                      Priority: wo.priority,
                      Category: wo.category,
                      Location: wo.location,
                      "Client Name": wo.clientName || "",
                      "Assigned To": wo.assignedUsers?.map((u) => `${u.firstName} ${u.lastName}`).join("; ") || "",
                      "Scheduled Date": wo.scheduledDate ? new Date(wo.scheduledDate).toLocaleDateString() : "",
                      "Completed Date": wo.completedDate ? new Date(wo.completedDate).toLocaleDateString() : "",
                      "NTE ($)": wo.nte || "",
                      "TNTE ($)": wo.tnte || "",
                    }));
                    exportToCSV(rows, "work_orders");
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t("workOrders.exportCSV")}
                </Button>
                <ButtonGuard buttonType="create">
                  <Button onClick={() => setIsCreating(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("workOrders.createWorkOrder")}
                  </Button>
                </ButtonGuard>
                <Button variant="outline" onClick={() => refetch()}>
                  {t("common.refresh")}
                </Button>
              </div>
            </ModalGuard>
          </div>

          {/* Search and Filters */}
          <div className="mt-6 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
              <Input
                placeholder={t("workOrders.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t("workOrders.filterByStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("workOrders.allStatuses")}</SelectItem>
                {statuses.map(status => (
                  <SelectItem key={status} value={status}>
                    <Badge className={`${getStatusColor(status)} text-xs`}>{status}</Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t("workOrders.filterByCategory")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("workOrders.allCategories")}</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Results Count */}
          <div className="mt-4 text-sm text-gray-600">
            {filteredWorkOrders.length} / {workOrders.length} {t("workOrders.title").toLowerCase()}
            {(searchTerm || statusFilter !== "all" || categoryFilter !== "all") && (
              <Button
                variant="link" size="sm"
                onClick={() => { setSearchTerm(""); setStatusFilter("all"); setCategoryFilter("all"); }}
                className="ml-2 p-0 h-auto text-sm"
              >
                {t("common.reset")}
              </Button>
            )}
          </div>

          {/* Work Order Cards */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWorkOrders.map((workOrder) => (
              <Card key={workOrder.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold text-blue-600">
                        {workOrder.workOrderNumber}
                      </CardTitle>
                      <CardDescription className="font-medium text-gray-900 mt-1">
                        {workOrder.title}
                      </CardDescription>
                    </div>
                    <Badge className={getStatusColor(workOrder.status)}>
                      {workOrder.status.charAt(0).toUpperCase() + workOrder.status.slice(1)}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{workOrder.location}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <User className="h-4 w-4 mr-2 flex-shrink-0" />
                    <div className="flex flex-wrap gap-1">
                      <span>{t("workOrders.assignedTo")}:</span>
                      {workOrder.assignedUsers && workOrder.assignedUsers.length > 0 ? (
                        workOrder.assignedUsers.map((u, i) => (
                          <span key={u.id}>
                            {u.firstName} {u.lastName}
                            {i < workOrder.assignedUsers!.length - 1 && ", "}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400">{t("common.noData")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>
                      {workOrder.scheduledDate ? formatDate(new Date(workOrder.scheduledDate)) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-900">
                      {t("workOrders.priority")}: {workOrder.priority}
                    </div>
                  </div>
                </CardContent>

                <div className="px-6 py-3 bg-gray-50 border-t flex justify-between">
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setSelectedWorkOrder(workOrder)}
                    className="flex-1 mr-1"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    {t("common.view")}
                  </Button>
                  <ButtonGuard buttonType="edit">
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setEditingWorkOrder(workOrder)}
                      className="flex-1 ml-1"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      {t("common.edit")}
                    </Button>
                  </ButtonGuard>
                </div>
              </Card>
            ))}
          </div>

          {filteredWorkOrders.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">{t("workOrders.noWorkOrders")}</h3>
                <p className="text-sm">{t("workOrders.noWorkOrdersDesc")}</p>
              </div>
            </div>
          )}
        </div>

        <CreateWorkOrderModal isOpen={isCreating} onClose={() => setIsCreating(false)} workOrder={null} />
        {editingWorkOrder && (
          <CreateWorkOrderModal isOpen={!!editingWorkOrder} onClose={() => setEditingWorkOrder(null)} workOrder={editingWorkOrder} />
        )}
        {selectedWorkOrder && (
          <WorkOrderDetailsModal isOpen={!!selectedWorkOrder} onClose={() => setSelectedWorkOrder(null)} workOrder={selectedWorkOrder} />
        )}
      </div>
    </PageGuard>
  );
}
