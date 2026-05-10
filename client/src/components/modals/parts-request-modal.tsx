import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Package } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { AdvancedPermissionGuard } from "@/components/rbac/advanced-permission-guard";
import type { WorkOrderWithUsers, WorkOrderPartsRequest } from "@shared/schema";

interface PartsRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrderWithUsers;
}

interface PartsEntry {
  partName: string;
  storeName: string;
  quantity: string;
  estimatedCost: string;
  storeAddress: string;
  urgency: string;
  description: string;
}

export function PartsRequestModal({ isOpen, onClose, workOrder }: PartsRequestModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [partsEntries, setPartsEntries] = useState<PartsEntry[]>([]);
  const [requestReason, setRequestReason] = useState("");

  // Fetch existing parts requests
  const { data: partsRequests = [], isLoading } = useQuery<WorkOrderPartsRequest[]>({
    queryKey: [`/api/work-orders/${workOrder.id}/parts-requests`],
    enabled: isOpen,
  });

  useEffect(() => {
    if (isOpen) {
      // Initialize with empty entry for new request
      setPartsEntries([createEmptyPartsEntry()]);
      setRequestReason("");
    }
  }, [isOpen]);

  function createEmptyPartsEntry(): PartsEntry {
    return {
      partName: "",
      storeName: "",
      quantity: "",
      estimatedCost: "",
      storeAddress: "",
      urgency: "normal",
      description: ""
    };
  }

  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => 
      apiRequest("PUT", `/api/parts-requests/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/work-orders/${workOrder.id}/parts-requests`] });
      queryClient.invalidateQueries({ queryKey: ["/api/parts-requests"] });
      toast({
        title: "Success",
        description: "Parts request status updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update parts request status",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async () => {
    if (partsEntries.some(entry => !entry.partName.trim() || !entry.quantity.trim())) {
      toast({
        title: "Error",
        description: "Please fill in at least part name and quantity for all entries",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Create individual parts requests for each entry
      for (const entry of partsEntries) {
        if (entry.partName.trim() && entry.quantity.trim()) {
          const requestData = {
            workOrderId: workOrder.id,
            partName: entry.partName.trim(),
            partNumber: entry.storeName.trim() || null,
            quantity: parseInt(entry.quantity) || 1,
            estimatedCost: entry.estimatedCost ? entry.estimatedCost.toString() : null,
            supplier: entry.storeAddress.trim() || null,
            urgency: entry.urgency || "normal",
            notes: `${requestReason ? requestReason + ". " : ""}${entry.description ? entry.description : ""}`.trim() || null,
            requestedBy: user?.id,
            status: "pending"
          };

          await apiRequest("POST", `/api/work-orders/${workOrder.id}/parts-requests`, requestData);
        }
      }

      queryClient.invalidateQueries({ queryKey: [`/api/work-orders/${workOrder.id}/parts-requests`] });
      queryClient.invalidateQueries({ queryKey: ["/api/parts-requests"] });
      toast({
        title: "Success",
        description: "Parts requests submitted successfully",
      });
      onClose();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit parts requests",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addPartsEntry = () => {
    setPartsEntries([...partsEntries, createEmptyPartsEntry()]);
  };

  const removePartsEntry = (index: number) => {
    setPartsEntries(partsEntries.filter((_, i) => i !== index));
  };

  const updatePartsEntry = (index: number, field: string, value: string) => {
    const updated = [...partsEntries];
    updated[index] = { ...updated[index], [field]: value };
    setPartsEntries(updated);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-green-100 text-green-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-yellow-100 text-yellow-800";
    }
  };

  const calculateTotalCost = () => {
    return partsEntries.reduce((total, entry) => {
      const cost = parseFloat(entry.estimatedCost) || 0;
      const quantity = parseFloat(entry.quantity) || 0;
      return total + (cost * quantity);
    }, 0);
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Loading Parts Requests</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3">Loading...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Parts Request - {workOrder.workOrderNumber}</DialogTitle>
          <DialogDescription>
            Request parts for {workOrder.clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Existing Parts Requests */}
          {partsRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Existing Parts Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {partsRequests.map((request) => {
                    return (
                      <div key={request.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Package className="h-4 w-4" />
                            <span className="font-medium">Request #{request.id}</span>
                            <Badge className={getStatusColor(request.status)}>
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(request.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        
                        {request.notes && (
                          <p className="text-sm text-gray-600 mb-2">{request.notes}</p>
                        )}
                        
                        <div className="text-sm grid grid-cols-4 gap-2 bg-gray-50 p-2 rounded">
                          <span><strong>{request.partName}</strong></span>
                          <span>Qty: {request.quantity}</span>
                          <span>Cost: ${request.estimatedCost || "0.00"}</span>
                          <span className="text-gray-500">{request.urgency}</span>
                        </div>

                        {request.status === "pending" && (
                          <AdvancedPermissionGuard permission="parts.approve">
                            <div className="flex space-x-2 mt-3">
                              <Button
                                size="sm"
                                onClick={() => updateStatusMutation.mutate({ id: request.id, status: "approved" })}
                                disabled={updateStatusMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => updateStatusMutation.mutate({ id: request.id, status: "cancelled" })}
                                disabled={updateStatusMutation.isPending}
                              >
                                Cancel
                              </Button>
                            </div>
                          </AdvancedPermissionGuard>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* New Parts Request Form */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>New Parts Request</CardTitle>
                <Button onClick={addPartsEntry} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Part
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {partsEntries.map((entry, index) => (
                  <div key={index} className="grid grid-cols-8 gap-4 items-end p-4 border rounded-lg">
                    <div>
                      <Label>Part Name *</Label>
                      <Input
                        placeholder="Part name"
                        value={entry.partName}
                        onChange={(e) => updatePartsEntry(index, "partName", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Store Name</Label>
                      <Input
                        placeholder="Store name"
                        value={entry.storeName}
                        onChange={(e) => updatePartsEntry(index, "storeName", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        placeholder="1"
                        value={entry.quantity}
                        onChange={(e) => updatePartsEntry(index, "quantity", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Cost ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={entry.estimatedCost}
                        onChange={(e) => updatePartsEntry(index, "estimatedCost", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Store Address</Label>
                      <Input
                        placeholder="Store address"
                        value={entry.storeAddress}
                        onChange={(e) => updatePartsEntry(index, "storeAddress", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Urgency</Label>
                      <Select
                        value={entry.urgency}
                        onValueChange={(value) => updatePartsEntry(index, "urgency", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Input
                        placeholder="Notes"
                        value={entry.description}
                        onChange={(e) => updatePartsEntry(index, "description", e.target.value)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removePartsEntry(index)}
                      disabled={partsEntries.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <div className="text-right">
                  <strong>Estimated Total: ${calculateTotalCost().toFixed(2)}</strong>
                </div>

                <div>
                  <Label htmlFor="requestReason">Request Reason</Label>
                  <Textarea
                    id="requestReason"
                    placeholder="Why are these parts needed?"
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit Parts Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}