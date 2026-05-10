import { Link, useLocation } from "wouter";
import { Shield, BarChart3, Users, UserCheck, Settings, Cog, LogOut, X, Map, ClipboardList, FileText, Package, DollarSign, TrendingUp, Upload, Database, Download, Languages, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { SidebarGuard } from "@/components/rbac/advanced-permission-guard";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useSystemSettings } from "@/contexts/system-settings";
import { useLanguage } from "@/contexts/language";
import { useTranslation } from "react-i18next";
import { prefetch } from "@/lib/queryClient";

// Map route paths → API endpoints to warm on hover
const PREFETCH_MAP: Record<string, string[]> = {
  "/dashboard":           ["/api/users", "/api/work-orders"],
  "/users":               ["/api/users", "/api/roles"],
  "/roles":               ["/api/roles", "/api/permissions"],
  "/technicians":         ["/api/technicians"],
  "/technician-map":      ["/api/technicians"],
  "/work-orders":         ["/api/work-orders"],
  "/proposals":           ["/api/proposals", "/api/work-orders"],
  "/parts-requests":      ["/api/parts-requests"],
  "/payment-manager":     ["/api/payment-requests"],
  "/technician-payments": ["/api/technicians"],
  "/invoices":            ["/api/invoices/all"],
  "/analytics":           [],
  "/financial-analysis":  [],
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user, role, logout, permissions } = useAuth();
  const { hasPermission } = usePermissions();
  const [isHovered, setIsHovered] = useState(false);
  const { systemName, logoUrl } = useSystemSettings();
  const { language, isRTL, toggleLanguage } = useLanguage();
  const { t } = useTranslation();

  const navigationSections = [
    {
      title: t("nav.overview"),
      items: [
        { name: t("nav.dashboard"), href: "/", icon: BarChart3, permission: "sidebar.overview" },
        { name: t("nav.analytics"), href: "/analytics", icon: TrendingUp, permission: "sidebar.overview" },
      ]
    },
    {
      title: t("nav.userManagement"),
      items: [
        { name: t("nav.users"), href: "/users", icon: Users, permission: "sidebar.user_management" },
        { name: t("nav.rolesPermissions"), href: "/roles", icon: UserCheck, permission: "sidebar.user_management" },
      ]
    },
    {
      title: t("nav.operations"),
      items: [
        { name: "Clients", href: "/clients", icon: Building2, permission: "sidebar.operations" },
        { name: t("nav.workOrders"), href: "/work-orders", icon: ClipboardList, permission: "sidebar.operations" },
        { name: t("nav.partsRequests"), href: "/parts-requests", icon: Package, permission: "sidebar.operations" },
        { name: t("nav.proposals"), href: "/proposals", icon: FileText, permission: "sidebar.operations" },
        { name: t("nav.invoices"), href: "/invoices", icon: FileText, permission: "sidebar.operations" },
      ]
    },
    {
      title: t("nav.technicians"),
      items: [
        { name: t("nav.technicianList"), href: "/technicians", icon: Settings, permission: "sidebar.technicians" },
        { name: t("nav.technicianMap"), href: "/technician-map", icon: Map, permission: "sidebar.technicians" },
      ]
    },
    {
      title: t("nav.payments"),
      items: [
        { name: t("nav.paymentManager"), href: "/payment-manager", icon: DollarSign, permission: "sidebar.payments" },
        { name: t("nav.technicianPayments"), href: "/technician-payments", icon: DollarSign, permission: "sidebar.payments" },
      ]
    },
    {
      title: t("nav.adminTools"),
      items: [
        { name: t("nav.dataImport"), href: "/data-import", icon: Upload, permission: "sidebar.user_management" },
        { name: t("nav.databaseImport"), href: "/database-import", icon: Database, permission: "sidebar.user_management" },
        { name: t("nav.databaseExport"), href: "/database-export", icon: Download, permission: "sidebar.user_management" },
        { name: t("nav.systemSettings"), href: "/settings", icon: Settings, permission: "sidebar.user_management" },
      ]
    }
  ];

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const tooltipClass = isRTL
    ? "absolute right-full mr-3 px-3 py-2 bg-slate-900/95 backdrop-blur-sm text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 whitespace-nowrap shadow-xl border border-slate-600/50"
    : "absolute left-full ml-3 px-3 py-2 bg-slate-900/95 backdrop-blur-sm text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 whitespace-nowrap shadow-xl border border-slate-600/50";

  const tooltipArrowClass = isRTL
    ? "absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-1 w-2 h-2 bg-slate-900/95 rotate-45 border-r border-b border-slate-600/50"
    : "absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-2 h-2 bg-slate-900/95 rotate-45 border-l border-b border-slate-600/50";

  const sidebarPositionClass = isRTL
    ? cn(
        "fixed inset-y-0 right-0 z-[2000] bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl border-l border-slate-600/30 transform transition-all duration-500 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        isOpen ? "translate-x-0" : "translate-x-full",
        "lg:w-16 lg:hover:w-64",
        isHovered ? "w-64" : "w-64 lg:w-16"
      )
    : cn(
        "fixed inset-y-0 left-0 z-[2000] bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl border-r border-slate-600/30 transform transition-all duration-500 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "lg:w-16 lg:hover:w-64",
        isHovered ? "w-64" : "w-64 lg:w-16"
      );

  return (
    <>
      {/* Mobile sidebar overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[1500] lg:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity" onClick={onClose} />
        </div>
      )}
      {/* Sidebar */}
      <div
        className={sidebarPositionClass}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex flex-col h-full pt-6 pb-4 overflow-hidden">
          {/* Mobile close button */}
          <div className="flex items-center justify-between px-4 lg:hidden">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center overflow-hidden">
                {logoUrl ? <img src={logoUrl} alt="logo" className="w-5 h-5 object-contain" /> : <Shield className="h-4 w-4 text-white" />}
              </div>
              <h1 className={cn("text-xl font-semibold text-white", isRTL ? "mr-3" : "ml-3")}>{systemName}</h1>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-5 w-5 text-white" />
            </Button>
          </div>

          {/* Logo */}
          <div className={cn(
            "hidden lg:flex items-center flex-shrink-0 mb-8 transition-all duration-500",
            isHovered ? "px-4" : "px-3 justify-center"
          )}>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg ring-2 ring-blue-400/20 flex-shrink-0 overflow-hidden">
              {logoUrl ? <img src={logoUrl} alt="logo" className="w-6 h-6 object-contain" /> : <Shield className="h-5 w-5 text-white" />}
            </div>
            <h1 className={cn(
              "text-xl font-bold text-white transition-all duration-500 bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent",
              isRTL ? "mr-4" : "ml-4",
              isHovered ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
            )}>{systemName}</h1>
          </div>

          {/* User Info */}
          <div className={cn(
            "mt-2 mb-4 flex-shrink-0 transition-all duration-500",
            isHovered ? "px-4" : "px-3"
          )}>
            <div className={cn(
              "flex items-center transition-all duration-500 shadow-lg",
              isHovered
                ? "p-3 bg-gradient-to-r from-slate-700/60 to-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-600/30"
                : "p-2 bg-transparent rounded-full justify-center"
            )}>
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center shadow-md ring-2 ring-emerald-400/30 flex-shrink-0">
                <span className="text-white font-bold text-sm">
                  {user ? getInitials(user.firstName, user.lastName) : ""}
                </span>
              </div>
              <div className={cn(
                "transition-all duration-500",
                isRTL ? "mr-3" : "ml-3",
                isHovered ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
              )}>
                <p className="text-sm font-semibold text-white whitespace-nowrap">
                  {user ? `${user.firstName} ${user.lastName}` : ""}
                </p>
                <p className="text-xs text-slate-300 capitalize whitespace-nowrap font-medium">
                  {role?.name || ""}
                </p>
                <div className="mt-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-7 bg-slate-600/50 border-slate-500/50 text-slate-200 hover:bg-red-600/20 hover:border-red-500/50 hover:text-red-300 transition-all duration-300"
                      >
                        <LogOut className={cn("h-3 w-3", isRTL ? "ml-1" : "mr-1")} />
                        {t("auth.signOut")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center text-lg">
                          <LogOut className={cn("h-5 w-5 text-slate-600", isRTL ? "ml-2" : "mr-2")} />
                          {t("auth.signOutConfirm")}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600">
                          {t("auth.signOutMessage")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="hover:bg-slate-100">
                          {t("common.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={logout}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          {t("auth.yesSignOut")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-3 overflow-y-auto scrollbar-thin">
            {navigationSections.map((section) => {
              const hasAnyPermission = section.items.some(item =>
                !item.permission || hasPermission(item.permission)
              );

              if (!hasAnyPermission) return null;

              return (
                <div key={section.title} className="space-y-1">
                  {/* Section Title */}
                  <div className={cn(
                    "transition-all duration-500",
                    isHovered ? "opacity-100 px-2 py-1 mb-1" : "opacity-0 h-0 overflow-hidden mb-0"
                  )}>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {section.title}
                    </h3>
                  </div>

                  {/* Section Items */}
                  <div className="space-y-0.5">
                    {section.items
                      .filter((item) => !item.permission || hasPermission(item.permission))
                      .map((item) => {
                        const isActive = location === item.href;
                        const Icon = item.icon;
                        return (
                          <Link key={item.name} href={item.href}>
                            <button
                              className={cn(
                                "w-full group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-300 text-left relative transform hover:scale-105 active:scale-95",
                                isActive
                                  ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/25 border border-blue-400/30"
                                  : "text-slate-300 hover:bg-gradient-to-r hover:from-slate-700/50 hover:to-slate-600/50 hover:text-white hover:shadow-md backdrop-blur-sm border border-transparent hover:border-slate-500/30"
                              )}
                              onClick={onClose}
                              onMouseEnter={() => {
                                (PREFETCH_MAP[item.href] ?? []).forEach(prefetch);
                              }}
                            >
                              <Icon className="h-4 w-4 flex-shrink-0" />
                              <span className={cn(
                                "transition-all duration-500 whitespace-nowrap font-medium",
                                isRTL ? "mr-3" : "ml-3",
                                isHovered ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
                              )}>
                                {item.name}
                              </span>
                              {!isHovered && (
                                <div className={tooltipClass}>
                                  {item.name}
                                  <div className={tooltipArrowClass}></div>
                                </div>
                              )}
                            </button>
                          </Link>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Language Toggle */}
          <div className={cn(
            "flex-shrink-0 px-3 pb-2 transition-all duration-500"
          )}>
            <button
              onClick={toggleLanguage}
              className={cn(
                "w-full group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-300 text-slate-300 hover:bg-gradient-to-r hover:from-slate-700/50 hover:to-slate-600/50 hover:text-white hover:shadow-md border border-transparent hover:border-slate-500/30 relative",
                isHovered ? "" : "justify-center"
              )}
              title={language === "en" ? "Switch to Arabic" : "Switch to English"}
            >
              <Languages className="h-4 w-4 flex-shrink-0" />
              <span className={cn(
                "transition-all duration-500 whitespace-nowrap font-medium",
                isRTL ? "mr-3" : "ml-3",
                isHovered ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
              )}>
                {language === "en" ? "العربية" : "English"}
              </span>
              {!isHovered && (
                <div className={tooltipClass}>
                  {language === "en" ? "العربية" : "English"}
                  <div className={tooltipArrowClass}></div>
                </div>
              )}
            </button>
          </div>

          {/* Logout for collapsed state */}
          <div className={cn(
            "flex-shrink-0 flex border-t border-slate-600/30 p-4 mt-2 transition-all duration-500",
            isHovered ? "opacity-0 h-0 overflow-hidden p-0 mt-0" : "opacity-100"
          )}>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex-shrink-0 w-full group block text-left hover:bg-gradient-to-r hover:from-red-600/20 hover:to-red-700/20 rounded-xl p-3 transition-all duration-300 relative transform hover:scale-105 active:scale-95 border border-transparent hover:border-red-500/30">
                  <div className="flex items-center justify-center">
                    <LogOut className="h-5 w-5 text-slate-400 group-hover:text-red-400 flex-shrink-0 transition-colors duration-300" />
                    <div className={tooltipClass}>
                      {t("auth.signOut")}
                      <div className={tooltipArrowClass}></div>
                    </div>
                  </div>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center text-lg">
                    <LogOut className={cn("h-5 w-5 text-slate-600", isRTL ? "ml-2" : "mr-2")} />
                    {t("auth.signOutConfirm")}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-600">
                    {t("auth.signOutMessage")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="hover:bg-slate-100">
                    {t("common.cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={logout}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {t("auth.yesSignOut")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </>
  );
}
