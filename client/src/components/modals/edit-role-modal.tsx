import { useState, useEffect } from "react";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Permission, RoleWithPermissions } from "@shared/schema";

interface EditRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: RoleWithPermissions | null;
}

export function EditRoleModal({ isOpen, onClose, role }: EditRoleModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");

  const { data: allPermissions = [] } = useQuery<Permission[]>({
    queryKey: ["/api/permissions"],
    enabled: isOpen,
  });

  // Initialize form data when role changes
  React.useEffect(() => {
    if (role) {
      setSelectedPermissions(role.permissions.map(p => p.id));
      setRoleName(role.name);
      setRoleDescription(role.description || "");
    } else {
      setSelectedPermissions([]);
      setRoleName("");
      setRoleDescription("");
    }
  }, [role]);

  const createRoleMutation = useMutation({
    mutationFn: (data: { name: string; description: string; permissionIds: number[] }) =>
      apiRequest("POST", "/api/roles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({
        title: "Success",
        description: "Role created successfully",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create role",
        variant: "destructive",
      });
    },
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: (data: { roleId: number; permissionIds: number[] }) => {
      console.log("Updating role permissions:", data);
      return apiRequest("POST", `/api/roles/${data.roleId}/permissions`, { permissionIds: data.permissionIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({
        title: "Success",
        description: "Role permissions updated successfully",
      });
      onClose();
    },
    onError: (error: any) => {
      console.error("Update permissions error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update permissions",
        variant: "destructive",
      });
    },
  });

  const handlePermissionChange = (permissionId: number, checked: boolean) => {
    if (checked) {
      setSelectedPermissions(prev => [...prev, permissionId]);
    } else {
      setSelectedPermissions(prev => prev.filter(id => id !== permissionId));
    }
  };

  const handleSave = () => {
    if (role) {
      // Update existing role permissions
      updatePermissionsMutation.mutate({
        roleId: role.id,
        permissionIds: selectedPermissions,
      });
    } else {
      // Create new role
      if (!roleName.trim()) {
        toast({
          title: "Error",
          description: "Role name is required",
          variant: "destructive",
        });
        return;
      }
      
      createRoleMutation.mutate({
        name: roleName.trim(),
        description: roleDescription.trim(),
        permissionIds: selectedPermissions,
      });
    }
  };

  // Group permissions by category
  const groupedPermissions = allPermissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, typeof allPermissions>);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Dashboard": return "📊";
      case "Analytics": return "📈";
      case "User Management": return "👥";
      case "Role Management": return "🔐";
      case "Technician Management": return "🔧";
      case "Work Order Management": return "📋";
      case "Proposal Management": return "📄";
      case "Parts Management": return "📦";
      case "File Management": return "📁";
      case "Communication": return "💬";
      case "Payment Management": return "💳";
      case "Invoice Management": return "🧾";
      case "Financial Analysis": return "💰";
      case "System Administration": return "⚙️";
      default: return "🔹";
    }
  };

  const selectedCount = selectedPermissions.length;
  const totalCount = allPermissions.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            {role ? (
              <>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {role.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                Edit Role Permissions
              </>
            ) : (
              <>
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                  <span className="text-white text-xl">+</span>
                </div>
                Create New Role
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            {role 
              ? `Configure permissions for the ${role.name} role. Selected ${selectedCount} of ${totalCount} permissions.`
              : "Create a new role and assign specific permissions to control system access."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {!role && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-xl">🏷️</span>
                Role Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="roleName" className="text-sm font-medium text-gray-700 mb-2 block">
                    Role Name
                  </Label>
                  <Input
                    id="roleName"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="e.g., Manager, Supervisor, Operator"
                    className="w-full"
                  />
                </div>
                <div>
                  <Label htmlFor="roleDescription" className="text-sm font-medium text-gray-700 mb-2 block">
                    Description
                  </Label>
                  <Textarea
                    id="roleDescription"
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    placeholder="Describe the role's responsibilities and access level"
                    rows={1}
                    className="w-full resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <span className="text-xl">🔐</span>
                Permission Categories
              </h3>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setSelectedPermissions(allPermissions.map(p => p.id));
                  }}
                >
                  Select All
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setSelectedPermissions([]);
                  }}
                >
                  Clear All
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.entries(groupedPermissions).map(([category, permissions]) => {
                const categorySelected = permissions.filter(p => selectedPermissions.includes(p.id)).length;
                const categoryTotal = permissions.length;
                const isAllSelected = categorySelected === categoryTotal;
                const isPartialSelected = categorySelected > 0 && categorySelected < categoryTotal;

                return (
                  <div key={category} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getCategoryIcon(category)}</span>
                        <div>
                          <h4 className="font-semibold text-gray-900">{category}</h4>
                          <p className="text-xs text-gray-500">{categorySelected} of {categoryTotal} selected</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className={`text-xs font-medium ${
                            isAllSelected ? 'text-green-600' : 
                            isPartialSelected ? 'text-blue-600' : 'text-gray-400'
                          }`}>
                            {Math.round((categorySelected / categoryTotal) * 100)}%
                          </div>
                        </div>
                        <Checkbox
                          checked={isAllSelected}
                          ref={(ref) => {
                            if (ref) {
                              ref.indeterminate = isPartialSelected;
                            }
                          }}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedPermissions([
                                ...selectedPermissions.filter(id => !permissions.map(p => p.id).includes(id)),
                                ...permissions.map(p => p.id)
                              ]);
                            } else {
                              setSelectedPermissions(
                                selectedPermissions.filter(id => !permissions.map(p => p.id).includes(id))
                              );
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {permissions.map((permission) => (
                        <div 
                          key={permission.id} 
                          className={`flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors ${
                            selectedPermissions.includes(permission.id) ? 'bg-blue-50 border border-blue-200' : ''
                          }`}
                        >
                          <Checkbox
                            id={`permission-${permission.id}`}
                            checked={selectedPermissions.includes(permission.id)}
                            onCheckedChange={(checked) => 
                              handlePermissionChange(permission.id, checked as boolean)
                            }
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <Label
                              htmlFor={`permission-${permission.id}`}
                              className="text-sm font-medium text-gray-900 cursor-pointer block"
                            >
                              {permission.name}
                            </Label>
                            {permission.description && (
                              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                {permission.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t pt-4 bg-gray-50 -mx-6 px-6 -mb-6 pb-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{selectedCount}</span> of <span className="font-medium">{totalCount}</span> permissions selected
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={updatePermissionsMutation.isPending || createRoleMutation.isPending}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              >
                {updatePermissionsMutation.isPending || createRoleMutation.isPending 
                  ? "Saving..." 
                  : role ? "Save Changes" : "Create Role"
                }
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
