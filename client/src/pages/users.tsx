import { useState } from "react";
import { Plus, Edit, Trash2, UserCheck } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AdvancedPermissionGuard, PageGuard, ButtonGuard } from "@/components/rbac/advanced-permission-guard";
import { CreateUserModal } from "@/components/modals/create-user-modal";
import { EditUserModal } from "@/components/modals/edit-user-modal";
import { AssignRoleModal } from "@/components/modals/assign-role-modal";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { UserWithRole } from "@shared/schema";

export default function Users() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignRoleModal, setShowAssignRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: users = [], isLoading } = useQuery<UserWithRole[]>({
    queryKey: ["/api/users"],
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("DELETE", `/api/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Success", description: t("users.deleteUser") });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete user", variant: "destructive" });
    },
  });

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getRoleBadgeColor = (roleName: string) => {
    switch (roleName) {
      case "admin": return "bg-blue-100 text-blue-800";
      case "manager": return "bg-green-100 text-green-800";
      case "viewer": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusBadgeColor = (isActive: boolean) =>
    isActive ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800";

  return (
    <PageGuard pageName="users">
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{t("users.title")}</h1>
              <p className="mt-2 text-sm text-gray-600">{t("users.noUsersDesc")}</p>
            </div>
            <AdvancedPermissionGuard permission="users.create">
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t("users.createUser")}
              </Button>
            </AdvancedPermissionGuard>
          </div>

          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("users.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">{t("common.loading")}</div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">{t("users.noUsers")}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("common.name")}</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("users.role")}</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("common.status")}</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("common.date")}</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("common.actions")}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((user) => (
                          <tr key={user.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <Avatar className="h-10 w-10">
                                  <AvatarFallback className="bg-primary text-white">
                                    {getInitials(user.firstName, user.lastName)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">{user.firstName} {user.lastName}</div>
                                  <div className="text-sm text-gray-500">{user.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge className={getRoleBadgeColor(user.role?.name || "")}>
                                {user.role?.name || t("common.noData")}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge className={getStatusBadgeColor(user.isActive)}>
                                {user.isActive ? t("common.active") : t("common.inactive")}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex space-x-2">
                                <AdvancedPermissionGuard permission="users.edit">
                                  <Button variant="ghost" size="sm" onClick={() => { setSelectedUser(user); setShowEditModal(true); }} title={t("users.editUser")}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </AdvancedPermissionGuard>
                                <AdvancedPermissionGuard permission="roles.assign">
                                  <Button variant="ghost" size="sm" onClick={() => { setSelectedUser(user); setShowAssignRoleModal(true); }} title={t("users.assignRole")}>
                                    <UserCheck className="h-4 w-4" />
                                  </Button>
                                </AdvancedPermissionGuard>
                                <AdvancedPermissionGuard permission="users.delete">
                                  <Button variant="ghost" size="sm" onClick={() => deleteUserMutation.mutate(user.id)} disabled={deleteUserMutation.isPending} title={t("users.deleteUser")}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </AdvancedPermissionGuard>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <CreateUserModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
        <EditUserModal isOpen={showEditModal} onClose={() => { setShowEditModal(false); setSelectedUser(null); }} user={selectedUser} />
        <AssignRoleModal isOpen={showAssignRoleModal} onClose={() => { setShowAssignRoleModal(false); setSelectedUser(null); }} user={selectedUser} />
      </div>
    </PageGuard>
  );
}
