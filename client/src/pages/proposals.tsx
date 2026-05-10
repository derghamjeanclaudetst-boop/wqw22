import { useState } from "react";
import { Search, Eye, CheckCircle, XCircle, Clock, Filter, FileText, Plus, User, MapPin, Calendar, DollarSign, AlertCircle, Info, Users, Building, Wrench, Printer, FileSignature } from "lucide-react";
import { getStatusBadgeClass, getStatusInfo } from "@/lib/work-order-statuses";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WorkOrderProposalModal } from "@/components/modals/work-order-proposal-modal";
import { AdvancedPermissionGuard, PageGuard } from "@/components/rbac/advanced-permission-guard";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { printProposal } from "@/lib/print-utils";
import { useSystemSettings } from "@/contexts/system-settings";
import { useTranslation } from "react-i18next";
import type { WorkOrderWithUsers, WorkOrderProposal } from "@shared/schema";

export default function Proposals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { systemName, logoUrl } = useSystemSettings();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrderWithUsers | null>(null);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"requests" | "existing">("requests");

  const { data: workOrdersWithoutProposals = [], isLoading: isLoadingWorkOrders } = useQuery<WorkOrderWithUsers[]>({
    queryKey: ["/api/work-orders-without-proposals"],
    refetchInterval: 5000,
  });

  const { data: allProposals = [], isLoading: isLoadingProposals } = useQuery<(WorkOrderProposal & { workOrder: WorkOrderWithUsers })[]>({
    queryKey: ["/api/proposals"],
    refetchInterval: 5000,
  });

  const approveProposalMutation = useMutation({
    mutationFn: (proposalId: number) => apiRequest("PUT", `/api/proposals/${proposalId}/approve`),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Proposal approved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders-without-proposals"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve proposal",
        variant: "destructive",
      });
    },
  });

  const rejectProposalMutation = useMutation({
    mutationFn: (proposalId: number) => apiRequest("PUT", `/api/proposals/${proposalId}/reject`),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Proposal rejected successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders-without-proposals"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject proposal",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-green-100 text-green-800 border-green-200";
      case "pending": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "rejected": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved": return <CheckCircle className="h-4 w-4" />;
      case "pending": return <Clock className="h-4 w-4" />;
      case "rejected": return <XCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case "electrical": return <Wrench className="h-4 w-4 text-yellow-600" />;
      case "plumbing": return <Wrench className="h-4 w-4 text-blue-600" />;
      case "hvac": return <Wrench className="h-4 w-4 text-green-600" />;
      case "maintenance": return <Wrench className="h-4 w-4 text-purple-600" />;
      default: return <Building className="h-4 w-4 text-gray-600" />;
    }
  };

  const calculateProposalTotal = (proposal: WorkOrderProposal) => {
    // Use the saved totalCost field first — always accurate
    if (proposal.totalCost) {
      const saved = parseFloat(String(proposal.totalCost));
      if (!isNaN(saved)) return saved;
    }
    try {
      // New format: laborData stores { lines, scopeOfWork, taxRate }
      if (proposal.laborData) {
        const parsed = JSON.parse(proposal.laborData);
        if (parsed && parsed.lines && Array.isArray(parsed.lines)) {
          const sub = parsed.lines.reduce((sum: number, line: any) => {
            return sum + (parseFloat(line.rate) || 0) * (parseFloat(line.qty) || 0);
          }, 0);
          const taxRate = parseFloat(parsed.taxRate) || 0;
          return sub * (1 + taxRate / 100);
        }
        // Old format: laborData is an array
        if (Array.isArray(parsed)) {
          const labor = parsed.reduce((sum: number, entry: any) => {
            const payRate = parseFloat(entry.payRate) || 0;
            const regularHours = parseFloat(entry.regularHours) || 0;
            const otHours = parseFloat(entry.otHours) || 0;
            const otScale = parseFloat(entry.otScale) || 1.5;
            return sum + (payRate * regularHours) + (payRate * otHours * otScale);
          }, 0);
          const parts = proposal.partsData ? JSON.parse(proposal.partsData).reduce((sum: number, e: any) =>
            sum + (parseFloat(e.unitCost) || 0) * (parseFloat(e.quantity) || 0), 0) : 0;
          const services = proposal.servicesData ? JSON.parse(proposal.servicesData).reduce((sum: number, e: any) =>
            sum + (parseFloat(e.unitCost) || 0) * (parseFloat(e.quantity) || 0), 0) : 0;
          return labor + parts + services;
        }
      }
    } catch { /* ignore */ }
    return parseFloat(String(proposal.laborCost || 0)) +
           parseFloat(String(proposal.materialCost || 0)) +
           parseFloat(String(proposal.additionalCosts || 0));
  };

  const filteredWorkOrders = workOrdersWithoutProposals.filter(workOrder => {
    const matchesSearch = !searchTerm || 
      workOrder.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      workOrder.workOrderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      workOrder.category.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || workOrder.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const filteredProposals = allProposals.filter(proposal => {
    const matchesSearch = !searchTerm || 
      proposal.workOrder.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.workOrder.workOrderNumber.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || proposal.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || proposal.workOrder.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const categories = Array.from(new Set([
    ...workOrdersWithoutProposals.map(wo => wo.category),
    ...allProposals.map(p => p.workOrder.category)
  ])).filter(category => category && category.trim() !== '');

  const proposalStats = {
    pending: allProposals.filter(p => p.status === "pending").length,
    approved: allProposals.filter(p => p.status === "approved").length,
    rejected: allProposals.filter(p => p.status === "rejected").length,
    totalValue: allProposals
      .filter(p => p.status === "approved")
      .reduce((sum, p) => sum + calculateProposalTotal(p), 0)
  };

  return (
    <PageGuard pageName="proposals">
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t("proposals.title")}</h1>
            <p className="text-gray-600 mt-1">{t("proposals.subtitle")}</p>
          </div>
        </div>

        {/* Permission Information Alert */}
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <div className="space-y-2">
              <div className="font-medium">Proposal Management Permissions:</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div><strong>proposals.view:</strong> View all proposals and work order requests</div>
                <div><strong>proposals.create:</strong> Create new proposals for work orders</div>
                <div><strong>proposals.edit:</strong> Modify existing proposal details and costs</div>
                <div><strong>proposals.approve:</strong> Approve proposals for client presentation</div>
                <div><strong>proposals.reject:</strong> Reject proposals that need revision</div>
                <div><strong>proposals.delete:</strong> Remove proposals from the system</div>
              </div>
            </div>
          </AlertDescription>
        </Alert>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <Clock className="h-4 w-4 mr-2 text-yellow-600" />
                {t("proposals.pendingProposals")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{proposalStats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                {t("proposals.approvedProposals")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{proposalStats.approved}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <XCircle className="h-4 w-4 mr-2 text-red-600" />
                {t("proposals.rejectedProposals")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{proposalStats.rejected}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <DollarSign className="h-4 w-4 mr-2 text-blue-600" />
                {t("proposals.approvedValue")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                ${proposalStats.totalValue.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
          <Input
            placeholder="Search by work order title, number, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(category => (
              <SelectItem key={category} value={category || 'uncategorized'}>
                <div className="flex items-center">
                  {getCategoryIcon(category)}
                  <span className="ml-2">{category || 'Uncategorized'}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "requests" | "existing")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="requests" className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {t("proposals.requestProposals")} ({filteredWorkOrders.length})
          </TabsTrigger>
          <TabsTrigger value="existing" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t("proposals.existingProposals")} ({filteredProposals.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
          {/* Priority section — "Needs Proposal" flagged work orders */}
          {filteredWorkOrders.filter(w => w.status === "needs_proposal").length > 0 && (
            <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-900">
                <FileSignature className="h-5 w-5" />
                <p className="font-semibold text-sm">
                  {filteredWorkOrders.filter(w => w.status === "needs_proposal").length} work order(s) flagged as "Needs Proposal"
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filteredWorkOrders.filter(w => w.status === "needs_proposal").map((workOrder) => (
                  <Card key={workOrder.id} className="bg-white border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base flex items-center gap-2">
                            {getCategoryIcon(workOrder.category)}
                            <span className="truncate">{workOrder.title}</span>
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                            <span className="font-mono">{workOrder.workOrderNumber}</span>
                            <Badge variant="outline" className="text-xs">{workOrder.category}</Badge>
                            <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300">Needs Proposal</Badge>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm text-gray-700 line-clamp-2">{workOrder.description}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div className="flex items-center gap-1"><MapPin className="h-3 w-3 text-gray-400" /><span className="truncate">{workOrder.location}</span></div>
                        <div className="flex items-center gap-1"><DollarSign className="h-3 w-3 text-gray-400" /><span>NTE: ${workOrder.nte?.toLocaleString() || 'N/A'}</span></div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <AdvancedPermissionGuard permission="proposals.create">
                          <Button size="sm" className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={() => { setSelectedWorkOrder(workOrder); setIsProposalModalOpen(true); }}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" />Create Proposal
                          </Button>
                        </AdvancedPermissionGuard>
                        <Button size="sm" variant="outline" onClick={() => window.open(`/work-orders?viewId=${workOrder.id}`, '_blank')}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                Work Orders Requiring Proposals
              </CardTitle>
              <CardDescription>
                These work orders need detailed proposals with cost breakdowns, labor estimates, and material requirements.
                Creating a proposal helps provide accurate quotes to clients and ensures proper project planning.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingWorkOrders ? (
                <div className="text-center py-8">Loading work orders...</div>
              ) : filteredWorkOrders.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No work orders need proposals</h3>
                  <p className="text-gray-600">
                    {searchTerm || categoryFilter !== "all" 
                      ? "Try adjusting your search or category filter"
                      : "All work orders have proposals or are not ready for proposals yet"
                    }
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredWorkOrders.map((workOrder) => (
                    <Card key={workOrder.id} className={`hover:shadow-md transition-shadow border-l-4 ${workOrder.status === "needs_proposal" ? "border-l-amber-500" : "border-l-orange-500"}`}>
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <CardTitle className="text-lg flex items-center gap-2">
                              {getCategoryIcon(workOrder.category)}
                              <span className="truncate">{workOrder.title}</span>
                            </CardTitle>
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                              <span className="font-mono">{workOrder.workOrderNumber}</span>
                              <Badge variant="outline" className="text-xs">
                                {workOrder.category}
                              </Badge>
                              {workOrder.status && (
                                <Badge className={`text-xs ${getStatusBadgeClass(workOrder.status)}`}>
                                  {getStatusInfo(workOrder.status).label}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-gray-700 line-clamp-2">
                          {workOrder.description}
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-gray-400" />
                            <span className="truncate">{workOrder.location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="truncate">
                              {workOrder.requestedByUser?.firstName} {workOrder.requestedByUser?.lastName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            <span>{new Date(workOrder.createdAt).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-gray-400" />
                            <span>NTE: ${workOrder.nte?.toLocaleString() || 'Not specified'}</span>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <AdvancedPermissionGuard permission="proposals.create">
                            <Button
                              onClick={() => {
                                setSelectedWorkOrder(workOrder);
                                setIsProposalModalOpen(true);
                              }}
                              className="flex-1"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              {t("proposals.createProposal")}
                            </Button>
                          </AdvancedPermissionGuard>
                          <Button
                            variant="outline"
                            onClick={() => window.open(`/work-orders?viewId=${workOrder.id}`, '_blank')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="existing" className="space-y-4">
          {/* Status Filter for existing proposals */}
          <div className="flex gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-2 text-yellow-600" />
                    Pending
                  </div>
                </SelectItem>
                <SelectItem value="approved">
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                    Approved
                  </div>
                </SelectItem>
                <SelectItem value="rejected">
                  <div className="flex items-center">
                    <XCircle className="h-4 w-4 mr-2 text-red-600" />
                    Rejected
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                All Proposals
              </CardTitle>
              <CardDescription>
                Manage existing proposals, review their status, and take actions like approval or rejection.
                Approved proposals can be sent to clients for project authorization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingProposals ? (
                <div className="text-center py-8">Loading proposals...</div>
              ) : filteredProposals.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No proposals found</h3>
                  <p className="text-gray-600">
                    {searchTerm || statusFilter !== "all" || categoryFilter !== "all"
                      ? "Try adjusting your filters"
                      : "No proposals have been created yet"
                    }
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredProposals.map((proposal) => {
                    const total = calculateProposalTotal(proposal);
                    return (
                      <Card key={proposal.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <CardTitle className="text-lg flex items-center gap-2">
                                {getCategoryIcon(proposal.workOrder.category)}
                                <span className="truncate">{proposal.workOrder.title}</span>
                              </CardTitle>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                                <span className="font-mono">{proposal.workOrder.workOrderNumber}</span>
                                <Badge variant="outline" className="text-xs">
                                  {proposal.workOrder.category}
                                </Badge>
                              </div>
                            </div>
                            <Badge className={`${getStatusColor(proposal.status)} border`}>
                              <div className="flex items-center gap-1">
                                {getStatusIcon(proposal.status)}
                                <span className="capitalize">{proposal.status}</span>
                              </div>
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-gray-400" />
                              <span className="font-semibold">${total.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              <span>{new Date(proposal.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-400" />
                              <span className="truncate">
                                {proposal.workOrder.requestedByUser?.firstName} {proposal.workOrder.requestedByUser?.lastName}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-gray-400" />
                              <span className="truncate">{proposal.workOrder.location}</span>
                            </div>
                          </div>

                          {proposal.status === "pending" && (
                            <div className="flex gap-2 pt-2">
                              <AdvancedPermissionGuard permission="proposals.approve">
                                <Button
                                  size="sm"
                                  onClick={() => approveProposalMutation.mutate(proposal.id)}
                                  disabled={approveProposalMutation.isPending}
                                  className="flex-1"
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  {t("common.approve")}
                                </Button>
                              </AdvancedPermissionGuard>
                              <AdvancedPermissionGuard permission="proposals.reject">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => rejectProposalMutation.mutate(proposal.id)}
                                  disabled={rejectProposalMutation.isPending}
                                  className="flex-1"
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  {t("common.reject")}
                                </Button>
                              </AdvancedPermissionGuard>
                            </div>
                          )}
                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 gap-1.5"
                              onClick={() => printProposal({
                                systemName,
                                logoUrl,
                                proposal,
                                workOrder: proposal.workOrder,
                              })}
                            >
                              <Printer className="h-4 w-4" />
                              {t("proposals.printPDF")}
                            </Button>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(`/work-orders?viewId=${proposal.workOrder.id}`, '_blank')}
                              className="flex-1"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View Work Order
                            </Button>
                            <AdvancedPermissionGuard permission="proposals.edit">
                              <Button variant="outline" size="sm">
                                <FileText className="h-4 w-4" />
                              </Button>
                            </AdvancedPermissionGuard>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Proposal Modal */}
      {selectedWorkOrder && (
        <WorkOrderProposalModal
          isOpen={isProposalModalOpen}
          onClose={() => {
            setIsProposalModalOpen(false);
            setSelectedWorkOrder(null);
          }}
          workOrder={selectedWorkOrder}
        />
      )}
      </div>
    </PageGuard>
  );
}