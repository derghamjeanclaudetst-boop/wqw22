import { useState } from "react";
import { Search, Plus, MapPin, Phone, Mail, Star, Edit, Trash2, CreditCard, FileText, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdvancedPermissionGuard, useAdvancedPermissions, PageGuard } from "@/components/rbac/advanced-permission-guard";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CreateTechnicianModal } from "@/components/modals/create-technician-modal";
import type { Technician } from "@shared/schema";

export default function TechniciansPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { t } = useTranslation();

  const { data: technicians, isLoading } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  const deleteTechnicianMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/technicians/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      toast({ title: "Success", description: "Technician deleted successfully" });
      setShowDeleteDialog(false);
      setSelectedTechnician(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete technician",
        variant: "destructive"
      });
    },
  });

  const filteredTechnicians = technicians?.filter(tech => {
    const fullName = `${tech.firstName} ${tech.lastName}`.toLowerCase();
    const search = searchTerm.toLowerCase();
    return fullName.includes(search) ||
           tech.specialization.toLowerCase().includes(search) ||
           (tech.location && tech.location.toLowerCase().includes(search));
  }) || [];

  const parsePaymentMethods = (methods: string | null) => {
    if (!methods) return [];
    
    try {
      if (methods.startsWith('[') || methods.startsWith('{')) {
        return JSON.parse(methods);
      }
      return methods.split(',').map(m => m.trim()).filter(Boolean);
    } catch (error) {
      console.error('Error parsing payment methods:', error);
      return [];
    }
  };

  const formatPaymentMethod = (method: string) => {
    const methodNames: { [key: string]: string } = {
      paypal: "PayPal",
      credit_card: "Credit Card", 
      cash: "Cash",
      bank_transfer: "Bank Transfer",
      venmo: "Venmo",
      cashapp: "Cash App",
      zelle: "Zelle",
      check: "Check"
    };
    return methodNames[method] || method;
  };

  const handleAdd = () => {
    setSelectedTechnician(null);
    setIsModalOpen(true);
  };

  const handleEdit = (technician: Technician) => {
    setSelectedTechnician(technician);
    setIsModalOpen(true);
  };

  const handleDelete = (technician: Technician) => {
    setSelectedTechnician(technician);
    setShowDeleteDialog(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedTechnician(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading technicians...</p>
        </div>
      </div>
    );
  }

  return (
    <PageGuard pageName="technicians">
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t("technicians.title")}</h1>
          <p className="text-gray-600 mt-1">
            {t("technicians.title")}
          </p>
        </div>
        <AdvancedPermissionGuard permission="technicians.create">
          <Button onClick={handleAdd} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            {t("technicians.createTechnician")}
          </Button>
        </AdvancedPermissionGuard>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
          <Input
            placeholder="Search technicians by name, specialization, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.technicians")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{technicians?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {technicians?.filter(tech => tech.availability === 'available').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {technicians?.length ? 
                (technicians.reduce((sum, tech) => 
                  sum + (tech.averageRating ? parseFloat(tech.averageRating.toString()) : 0), 0
                ) / technicians.length).toFixed(1) : '0.0'
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Technicians Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTechnicians.map((technician) => (
          <Card key={technician.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg">
                    {technician.firstName} {technician.lastName}
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">{technician.specialization}</p>
                </div>
                <div className="flex space-x-1">
                  <AdvancedPermissionGuard permission="technicians.edit">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(technician)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </AdvancedPermissionGuard>
                  <AdvancedPermissionGuard permission="technicians.delete">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(technician)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AdvancedPermissionGuard>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Contact Information */}
              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                  <Phone className="h-4 w-4 mr-2" />
                  <a href={`tel:${technician.phone}`} className="hover:text-blue-600">
                    {technician.phone}
                  </a>
                </div>
                {technician.email && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail className="h-4 w-4 mr-2" />
                    <a href={`mailto:${technician.email}`} className="hover:text-blue-600">
                      {technician.email}
                    </a>
                  </div>
                )}
                {technician.location && (
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mr-2" />
                    {technician.location}
                  </div>
                )}
              </div>

              {/* Experience and Rating */}
              <div className="flex justify-between items-center">
                <div className="text-sm">
                  <span className="font-medium">Experience:</span>
                  <span className="ml-1">{technician.experience} years</span>
                </div>
                {technician.averageRating && (
                  <div className="flex items-center">
                    <Star className="h-4 w-4 text-yellow-400 mr-1" />
                    <span className="text-sm font-medium">
                      {parseFloat(technician.averageRating.toString()).toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">
                      ({technician.totalRatings} reviews)
                    </span>
                  </div>
                )}
              </div>

              {/* Availability Status */}
              <div className="flex items-center justify-between">
                <Badge 
                  variant={technician.availability === 'available' ? 'default' : 'secondary'}
                  className={technician.availability === 'available' ? 'bg-green-500' : ''}
                >
                  {technician.availability === 'available' ? 'Available' : 
                   technician.availability === 'busy' ? 'Busy' : 'Unavailable'}
                </Badge>
                <div className="text-sm font-medium text-green-600">
                  ${technician.hourlyRate}/hr
                </div>
              </div>

              {/* W9 Status */}
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">W9:</span>
                {!technician.w9Status || !technician.w9FileName ? (
                  <Badge variant="outline" className="text-xs text-red-600 border-red-200 bg-red-50 dark:bg-red-950/20">
                    <AlertCircle className="h-2.5 w-2.5 mr-1" />
                    Not on File
                  </Badge>
                ) : technician.w9Status === "verified" ? (
                  <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50 dark:bg-green-950/20">
                    <CheckCircle className="h-2.5 w-2.5 mr-1" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
                    <Clock className="h-2.5 w-2.5 mr-1" />
                    Pending Review
                  </Badge>
                )}
              </div>

              {/* Payment Methods */}
              {technician.paymentMethods && (
                <div>
                  <div className="flex items-center text-xs font-medium text-gray-700 mb-2">
                    <CreditCard className="h-3 w-3 mr-1" />
                    Payment Methods
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {parsePaymentMethods(technician.paymentMethods).slice(0, 3).map((method: string, index: number) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {formatPaymentMethod(method)}
                      </Badge>
                    ))}
                    {parsePaymentMethods(technician.paymentMethods).length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{parsePaymentMethods(technician.paymentMethods).length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <AdvancedPermissionGuard permission="payments.create">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toast({ title: "Info", description: "Payment request functionality available in work orders" })}
                    className="flex-1"
                  >
                    <CreditCard className="h-4 w-4 mr-1" />
                    Payment
                  </Button>
                </AdvancedPermissionGuard>
                <AdvancedPermissionGuard permission="technicians.rate">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toast({ title: "Info", description: "Rating functionality available in work orders" })}
                    className="flex-1"
                  >
                    <Star className="h-4 w-4 mr-1" />
                    Rate
                  </Button>
                </AdvancedPermissionGuard>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filteredTechnicians.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <Search className="h-16 w-16 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? 'No technicians found' : 'No technicians yet'}
          </h3>
          <p className="text-gray-600 mb-6">
            {searchTerm 
              ? 'Try adjusting your search criteria' 
              : 'Get started by adding your first technician'
            }
          </p>
          {!searchTerm && (
            <AdvancedPermissionGuard permission="technicians.create">
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Technician
              </Button>
            </AdvancedPermissionGuard>
          )}
        </div>
      )}

      {/* Add/Edit Technician Modal */}
      <CreateTechnicianModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        technician={selectedTechnician}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent aria-describedby="delete-technician-description">
          <DialogHeader>
            <DialogTitle>Delete Technician</DialogTitle>
          </DialogHeader>
          <p id="delete-technician-description" className="text-sm text-gray-600 mb-4">
            Are you sure you want to delete {selectedTechnician?.firstName} {selectedTechnician?.lastName}? 
            This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedTechnician && deleteTechnicianMutation.mutate(selectedTechnician.id)}
              disabled={deleteTechnicianMutation.isPending}
            >
              {deleteTechnicianMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </PageGuard>
  );
}