import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRIMARY_STATUSES } from "@/lib/work-order-statuses";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Search, UserPlus, Building2, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { WorkOrderWithUsers, User, Client } from "@shared/schema";

interface CreateWorkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrderWithUsers | null;
}

// Quick "Add New Client" inline form
interface QuickClientFormProps {
  initialName: string;
  onCreated: (client: Client) => void;
  onCancel: () => void;
}
function QuickClientForm({ initialName, onCreated, onCancel }: QuickClientFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: initialName,
    phone: "", email: "", city: "", state: "", street: "", zipCode: "", notes: "",
  });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/clients", data),
    onSuccess: async (res: any) => {
      const client: Client = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client created", description: `${client.name} added to your clients.` });
      onCreated(client);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium text-sm">
        <UserPlus className="h-4 w-4" />
        New Client Details
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Name *</Label>
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Full name or company" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Phone</Label>
          <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+1-555-0123" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="client@example.com" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">City</Label>
          <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="City" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">State</Label>
          <Input value={form.state} onChange={e => set("state", e.target.value)} placeholder="State / Province" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Street</Label>
          <Input value={form.street} onChange={e => set("street", e.target.value)} placeholder="Street address" className="h-8 text-sm" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          type="button"
          size="sm"
          disabled={mutation.isPending || !form.name.trim()}
          onClick={() => mutation.mutate(form)}
        >
          {mutation.isPending ? "Saving…" : "Save & Select Client"}
        </Button>
      </div>
    </div>
  );
}

export function CreateWorkOrderModal({ isOpen, onClose, workOrder }: CreateWorkOrderModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    clientId: null as number | null,
    clientName: "",
    clientPhone: "",
    clientEmail: "",
    clientWorkOrderNumber: "",
    city: "",
    street: "",
    zipCode: "",
    description: "",
    urgency: "medium",
    equipmentType: "",
    problemDescription: "",
    nte: "",
    tnte: "",
    startDate: "",
    endDate: "",
    estimatedHours: "",
    specialInstructions: "",
    accessInstructions: "",
    safetyRequirements: "",
    assignedUserIds: [] as number[],
    status: "active",
  });

  // Client search state
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const clientInputRef = useRef<HTMLInputElement>(null);

  // Fetch users for assignment dropdown
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });

  // Fetch all clients for search
  const { data: allClients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  // Filtered client suggestions
  const clientSuggestions = clientSearch.trim().length >= 1
    ? allClients.filter(c =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.email ?? "").toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.phone ?? "").includes(clientSearch)
      ).slice(0, 8)
    : [];

  const createWorkOrderMutation = useMutation({
    mutationFn: (data: any) =>
      workOrder
        ? apiRequest("PUT", `/api/work-orders/${workOrder.id}`, data)
        : apiRequest("POST", "/api/work-orders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: "Success",
        description: workOrder ? "Work order updated successfully" : "Work order created successfully",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save work order",
        variant: "destructive",
      });
    },
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (workOrder) {
      setFormData({
        clientId: (workOrder as any).clientId ?? null,
        clientName: workOrder.clientName || workOrder.title || "",
        clientPhone: workOrder.clientPhone || "",
        clientEmail: workOrder.clientEmail || "",
        clientWorkOrderNumber: workOrder.clientWorkOrderNumber || "",
        city: workOrder.city || "",
        street: workOrder.street || "",
        zipCode: workOrder.zipCode || "",
        description: workOrder.description || "",
        urgency: workOrder.priority || "medium",
        equipmentType: workOrder.equipmentType || workOrder.category || "",
        problemDescription: workOrder.problemDescription || "",
        nte: workOrder.nte || "",
        tnte: workOrder.tnte || "",
        startDate: workOrder.startDate ? new Date(workOrder.startDate).toISOString().split('T')[0] :
                   (workOrder.scheduledDate ? new Date(workOrder.scheduledDate).toISOString().split('T')[0] : ""),
        endDate: workOrder.endDate ? new Date(workOrder.endDate).toISOString().split('T')[0] : "",
        estimatedHours: workOrder.estimatedHours ? workOrder.estimatedHours.toString() : "",
        specialInstructions: workOrder.specialInstructions || "",
        accessInstructions: workOrder.accessInstructions || "",
        safetyRequirements: workOrder.safetyRequirements || "",
        assignedUserIds: workOrder.assignedTo ? [workOrder.assignedTo] : [],
        status: workOrder.status || "active",
      });
      // Pre-fill client search if editing
      if (workOrder.clientName) setClientSearch(workOrder.clientName);
    } else {
      setFormData({
        clientId: null,
        clientName: "",
        clientPhone: "",
        clientEmail: "",
        clientWorkOrderNumber: "",
        city: "",
        street: "",
        zipCode: "",
        description: "",
        urgency: "medium",
        equipmentType: "",
        problemDescription: "",
        nte: "",
        tnte: "",
        startDate: "",
        endDate: "",
        estimatedHours: "",
        specialInstructions: "",
        accessInstructions: "",
        safetyRequirements: "",
        assignedUserIds: [],
        status: "active",
      });
      setClientSearch("");
      setSelectedClient(null);
      setShowAddClient(false);
    }
  }, [workOrder, isOpen]);

  // Select a client from the dropdown and auto-fill
  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setClientSearch(client.name);
    setShowClientDropdown(false);
    setShowAddClient(false);
    setFormData(prev => ({
      ...prev,
      clientId: client.id,
      clientName: client.name,
      clientPhone: client.phone ?? prev.clientPhone,
      clientEmail: client.email ?? prev.clientEmail,
      city: client.city ?? prev.city,
      street: client.street ?? prev.street,
      zipCode: client.zipCode ?? prev.zipCode,
    }));
  };

  // Clear the selected client
  const handleClearClient = () => {
    setSelectedClient(null);
    setClientSearch("");
    setFormData(prev => ({ ...prev, clientId: null, clientName: "" }));
    setShowClientDropdown(false);
    setShowAddClient(false);
    setTimeout(() => clientInputRef.current?.focus(), 50);
  };

  // When a new client is created via the quick form
  const handleClientCreated = (client: Client) => {
    handleSelectClient(client);
    setShowAddClient(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.clientName.trim() || !formData.city.trim() ||
        !formData.street.trim() || !formData.description.trim() || !formData.nte.trim() || !formData.tnte.trim() ||
        !formData.startDate || !formData.endDate || formData.assignedUserIds.length === 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields and assign at least one user",
        variant: "destructive",
      });
      return;
    }

    const startDate = new Date(formData.startDate);
    const endDate = new Date(formData.endDate);
    if (endDate <= startDate) {
      toast({
        title: "Error",
        description: "End date must be after start date",
        variant: "destructive",
      });
      return;
    }

    const submitData = {
      title: formData.clientName,
      description: formData.description,
      priority: formData.urgency,
      category: formData.equipmentType,
      location: `${formData.street}, ${formData.city}`,
      estimatedHours: formData.estimatedHours || null,
      scheduledDate: formData.startDate || null,
      assignedTo: formData.assignedUserIds[0] || null,
      status: formData.status,
      requestedBy: user?.id,
      clientId: formData.clientId,
      clientName: formData.clientName,
      clientPhone: formData.clientPhone,
      clientEmail: formData.clientEmail,
      clientWorkOrderNumber: formData.clientWorkOrderNumber,
      city: formData.city,
      street: formData.street,
      zipCode: formData.zipCode,
      equipmentType: formData.equipmentType,
      problemDescription: formData.problemDescription,
      nte: formData.nte || null,
      tnte: formData.tnte || null,
      startDate: formData.startDate,
      endDate: formData.endDate,
      urgency: formData.urgency,
      specialInstructions: formData.specialInstructions,
      accessInstructions: formData.accessInstructions,
      safetyRequirements: formData.safetyRequirements,
    };

    createWorkOrderMutation.mutate(submitData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workOrder ? "Edit Work Order" : "Create New Work Order"}</DialogTitle>
          <DialogDescription>
            {workOrder ? "Update work order information and details." : "Enter complete work order details including client information, timeline, and assignments."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Client Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Client Information</h3>

            {/* Client Search / Select */}
            <div>
              <Label htmlFor="clientSearch">Client Name *</Label>
              <div className="relative mt-1">
                {selectedClient ? (
                  /* Selected client badge */
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                    <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-blue-800 dark:text-blue-200">{selectedClient.name}</span>
                      {selectedClient.city && (
                        <span className="text-xs text-blue-500 ml-2">{selectedClient.city}</span>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 shrink-0">
                      <Check className="h-3 w-3 mr-1" /> Linked
                    </Badge>
                    <button type="button" onClick={handleClearClient} className="text-blue-400 hover:text-blue-700">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  /* Search input */
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                      <Input
                        ref={clientInputRef}
                        id="clientSearch"
                        className="pl-9"
                        placeholder="Search existing clients or type a new name…"
                        value={clientSearch}
                        onChange={e => {
                          setClientSearch(e.target.value);
                          setFormData(prev => ({ ...prev, clientName: e.target.value, clientId: null }));
                          setShowClientDropdown(true);
                          setShowAddClient(false);
                        }}
                        onFocus={() => setShowClientDropdown(true)}
                        onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
                        autoComplete="off"
                      />
                    </div>

                    {/* Dropdown */}
                    {showClientDropdown && clientSearch.trim().length >= 1 && (
                      <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border rounded-md shadow-lg max-h-52 overflow-y-auto">
                        {clientSuggestions.length > 0 ? (
                          <>
                            {clientSuggestions.map(client => (
                              <button
                                key={client.id}
                                type="button"
                                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-950 flex items-center gap-3 border-b last:border-0"
                                onMouseDown={() => handleSelectClient(client)}
                              >
                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                                  <span className="text-blue-700 dark:text-blue-300 text-xs font-bold">
                                    {client.name.slice(0, 2).toUpperCase()}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium text-sm truncate">{client.name}</div>
                                  <div className="text-xs text-gray-400 truncate">
                                    {[client.city, (client as any).state, client.phone].filter(Boolean).join(" · ")}
                                  </div>
                                </div>
                              </button>
                            ))}
                            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-t">
                              <button
                                type="button"
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                onMouseDown={() => { setShowClientDropdown(false); setShowAddClient(true); }}
                              >
                                <UserPlus className="h-3 w-3" />
                                Add "{clientSearch}" as a new client
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="px-3 py-3">
                            <p className="text-sm text-gray-500 mb-2">No existing client found.</p>
                            <button
                              type="button"
                              className="text-sm text-blue-600 hover:underline flex items-center gap-1 font-medium"
                              onMouseDown={() => { setShowClientDropdown(false); setShowAddClient(true); }}
                            >
                              <UserPlus className="h-4 w-4" />
                              Add "{clientSearch}" as a new client
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Quick Add New Client inline form */}
            {showAddClient && (
              <QuickClientForm
                initialName={clientSearch}
                onCreated={handleClientCreated}
                onCancel={() => setShowAddClient(false)}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clientWorkOrderNumber">Client Work Order Number</Label>
                <Input
                  id="clientWorkOrderNumber"
                  value={formData.clientWorkOrderNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, clientWorkOrderNumber: e.target.value }))}
                  placeholder="Enter client's work order number"
                />
              </div>
              <div>
                <Label htmlFor="clientPhone">Client Phone</Label>
                <Input
                  id="clientPhone"
                  value={formData.clientPhone}
                  onChange={(e) => setFormData(prev => ({ ...prev, clientPhone: e.target.value }))}
                  placeholder="+1-555-0123"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clientEmail">Client Email</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  value={formData.clientEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, clientEmail: e.target.value }))}
                  placeholder="client@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="City"
                  required
                />
              </div>
              <div>
                <Label htmlFor="street">Street *</Label>
                <Input
                  id="street"
                  value={formData.street}
                  onChange={(e) => setFormData(prev => ({ ...prev, street: e.target.value }))}
                  placeholder="Street address"
                  required
                />
              </div>
              <div>
                <Label htmlFor="zipCode">ZIP Code</Label>
                <Input
                  id="zipCode"
                  value={formData.zipCode}
                  onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                  placeholder="12345"
                />
              </div>
            </div>
          </div>

          {/* Work Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Work Details</h3>

            <div>
              <Label htmlFor="description">Work Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the work to be performed..."
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="urgency">Urgency Level</Label>
                <Select
                  value={formData.urgency}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, urgency: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="equipmentType">Equipment Type</Label>
                <Input
                  id="equipmentType"
                  value={formData.equipmentType}
                  onChange={(e) => setFormData(prev => ({ ...prev, equipmentType: e.target.value }))}
                  placeholder="HVAC, Electrical, Plumbing..."
                />
              </div>
              <div>
                <Label htmlFor="estimatedHours">Estimated Hours</Label>
                <Input
                  id="estimatedHours"
                  type="number"
                  step="0.5"
                  value={formData.estimatedHours}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimatedHours: e.target.value }))}
                  placeholder="8.0"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="problemDescription">Problem Description</Label>
              <Textarea
                id="problemDescription"
                value={formData.problemDescription}
                onChange={(e) => setFormData(prev => ({ ...prev, problemDescription: e.target.value }))}
                placeholder="Detailed description of the problem or issue..."
                rows={2}
              />
            </div>
          </div>

          {/* Additional Instructions */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Instructions & Requirements</h3>

            <div>
              <Label htmlFor="specialInstructions">Special Instructions</Label>
              <Textarea
                id="specialInstructions"
                value={formData.specialInstructions}
                onChange={(e) => setFormData(prev => ({ ...prev, specialInstructions: e.target.value }))}
                placeholder="Any special instructions for the technician..."
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="accessInstructions">Access Instructions</Label>
              <Textarea
                id="accessInstructions"
                value={formData.accessInstructions}
                onChange={(e) => setFormData(prev => ({ ...prev, accessInstructions: e.target.value }))}
                placeholder="How to access the site, key codes, contact person..."
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="safetyRequirements">Safety Requirements</Label>
              <Textarea
                id="safetyRequirements"
                value={formData.safetyRequirements}
                onChange={(e) => setFormData(prev => ({ ...prev, safetyRequirements: e.target.value }))}
                placeholder="PPE requirements, safety protocols, hazards to be aware of..."
                rows={2}
              />
            </div>
          </div>

          {/* Financial Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Financial Details</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nte">NTE (without tax) *</Label>
                <Input
                  id="nte"
                  type="number"
                  step="0.01"
                  value={formData.nte}
                  onChange={(e) => setFormData(prev => ({ ...prev, nte: e.target.value }))}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <Label htmlFor="tnte">TNTE (including tax) *</Label>
                <Input
                  id="tnte"
                  type="number"
                  step="0.01"
                  value={formData.tnte}
                  onChange={(e) => setFormData(prev => ({ ...prev, tnte: e.target.value }))}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
          </div>

          {/* Project Timeline */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Project Timeline</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                  required
                />
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Assignment</h3>

            <div className="space-y-4">
              <div>
                <Label>Assigned Users * (Select multiple users)</Label>
                <Card className="mt-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">
                      Selected Users ({formData.assignedUserIds.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {formData.assignedUserIds.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {formData.assignedUserIds.map((userId) => {
                          const u = users.find(u => u.id === userId);
                          return u ? (
                            <div key={userId} className="flex items-center bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-sm">
                              <span>{u.firstName} {u.lastName}</span>
                              <button
                                type="button"
                                onClick={() => setFormData(prev => ({
                                  ...prev,
                                  assignedUserIds: prev.assignedUserIds.filter(id => id !== userId)
                                }))}
                                className="ml-2 text-blue-600 hover:text-blue-800"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : null;
                        })}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">No users selected</p>
                    )}

                    <div className="border-t pt-3 space-y-2">
                      <h4 className="text-sm font-medium">Available Users:</h4>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {users.filter(u => !formData.assignedUserIds.includes(u.id)).map((u) => (
                          <div key={u.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`user-${u.id}`}
                              checked={false}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setFormData(prev => ({
                                    ...prev,
                                    assignedUserIds: [...prev.assignedUserIds, u.id]
                                  }));
                                }
                              }}
                            />
                            <Label htmlFor={`user-${u.id}`} className="text-sm cursor-pointer">
                              {u.firstName} {u.lastName} ({u.username})
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {PRIMARY_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createWorkOrderMutation.isPending}
            >
              {createWorkOrderMutation.isPending
                ? "Saving..."
                : workOrder ? "Update Work Order" : "Create Work Order"
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
