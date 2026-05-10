import { db } from "./db";
import { users, roles, permissions, userRoles, rolePermissions, technicians } from "@shared/schema";
import bcrypt from "bcrypt";

export async function seedDatabase() {
  try {
    console.log("Starting database seed...");

    // Check if already seeded — check roles first (inserted before users).
    // This prevents a crash if the app starts twice or the seed was partially run.
    try {
      const existingRoles = await db.select().from(roles);
      if (existingRoles.length > 0) {
        console.log("Database already seeded");
        return;
      }
    } catch (error) {
      console.log("Roles table doesn't exist yet, continuing with seed...");
    }

    // Create roles
    const [adminRole] = await db.insert(roles).values({
      name: "admin",
      description: "Full system access with all permissions"
    }).returning();

    const [managerRole] = await db.insert(roles).values({
      name: "manager",
      description: "Management access with most permissions"
    }).returning();

    const [technicianRole] = await db.insert(roles).values({
      name: "technician",
      description: "Technician access for work orders and tasks"
    }).returning();

    const [viewerRole] = await db.insert(roles).values({
      name: "viewer",
      description: "Read-only access to view data"
    }).returning();

    // Create comprehensive permissions with granular control for every page and modal
    const permissionData = [
      // Dashboard & Overview Pages
      { name: "dashboard.view", description: "View dashboard and overview", category: "Dashboard" },
      { name: "dashboard.stats", description: "View dashboard statistics", category: "Dashboard" },
      { name: "dashboard.widgets", description: "Customize dashboard widgets", category: "Dashboard" },
      { name: "analytics.view", description: "View analytics and reports", category: "Analytics" },
      { name: "analytics.export", description: "Export analytics data", category: "Analytics" },
      { name: "analytics.financial", description: "View financial analytics", category: "Analytics" },
      
      // User Management Page & Modals
      { name: "users.page.view", description: "Access users management page", category: "User Management" },
      { name: "users.list.view", description: "View users list", category: "User Management" },
      { name: "users.modal.create", description: "Open create user modal", category: "User Management" },
      { name: "users.create", description: "Create new users", category: "User Management" },
      { name: "users.modal.edit", description: "Open edit user modal", category: "User Management" },
      { name: "users.edit", description: "Edit user information", category: "User Management" },
      { name: "users.modal.delete", description: "Open delete user confirmation", category: "User Management" },
      { name: "users.delete", description: "Delete users", category: "User Management" },
      { name: "users.modal.profile", description: "View user profile modal", category: "User Management" },
      { name: "users.activate", description: "Activate/deactivate users", category: "User Management" },
      { name: "users.reset_password", description: "Reset user passwords", category: "User Management" },
      { name: "users.search", description: "Search users", category: "User Management" },
      { name: "users.filter", description: "Filter users list", category: "User Management" },
      { name: "users.export", description: "Export users data", category: "User Management" },
      
      // Role Management Page & Modals
      { name: "roles.page.view", description: "Access roles management page", category: "Role Management" },
      { name: "roles.list.view", description: "View roles list", category: "Role Management" },
      { name: "roles.modal.create", description: "Open create role modal", category: "Role Management" },
      { name: "roles.create", description: "Create new roles", category: "Role Management" },
      { name: "roles.modal.edit", description: "Open edit role modal", category: "Role Management" },
      { name: "roles.edit", description: "Edit role information", category: "Role Management" },
      { name: "roles.modal.delete", description: "Open delete role confirmation", category: "Role Management" },
      { name: "roles.delete", description: "Delete roles", category: "Role Management" },
      { name: "roles.modal.permissions", description: "Open role permissions modal", category: "Role Management" },
      { name: "roles.assign", description: "Assign roles to users", category: "Role Management" },
      { name: "permissions.view", description: "View permissions", category: "Role Management" },
      { name: "permissions.assign", description: "Assign permissions to roles", category: "Role Management" },
      
      // Technician Management Page & Modals
      { name: "technicians.page.view", description: "Access technicians management page", category: "Technician Management" },
      { name: "technicians.list.view", description: "View technicians list", category: "Technician Management" },
      { name: "technicians.modal.create", description: "Open create technician modal", category: "Technician Management" },
      { name: "technicians.create", description: "Create new technicians", category: "Technician Management" },
      { name: "technicians.modal.edit", description: "Open edit technician modal", category: "Technician Management" },
      { name: "technicians.edit", description: "Edit technician information", category: "Technician Management" },
      { name: "technicians.modal.delete", description: "Open delete technician confirmation", category: "Technician Management" },
      { name: "technicians.delete", description: "Delete technicians", category: "Technician Management" },
      { name: "technicians.modal.rate", description: "Open technician rating modal", category: "Technician Management" },
      { name: "technicians.rate", description: "Rate technicians", category: "Technician Management" },
      { name: "technicians.modal.profile", description: "View technician profile modal", category: "Technician Management" },
      { name: "technicians.map.view", description: "Access technician map page", category: "Technician Management" },
      { name: "technicians.map", description: "View technician map", category: "Technician Management" },
      { name: "technicians.location", description: "View technician locations", category: "Technician Management" },
      { name: "technicians.search", description: "Search technicians", category: "Technician Management" },
      
      // Work Order Management Page & All Modals
      { name: "workorders.page.view", description: "Access work orders page", category: "Work Order Management" },
      { name: "workorders.list.view", description: "View work orders list", category: "Work Order Management" },
      { name: "workorders.modal.create", description: "Open create work order modal", category: "Work Order Management" },
      { name: "workorders.create", description: "Create new work orders", category: "Work Order Management" },
      { name: "workorders.modal.edit", description: "Open edit work order modal", category: "Work Order Management" },
      { name: "workorders.edit", description: "Edit work order information", category: "Work Order Management" },
      { name: "workorders.modal.details", description: "Open work order details modal", category: "Work Order Management" },
      { name: "workorders.details.view", description: "View work order details", category: "Work Order Management" },
      { name: "workorders.modal.delete", description: "Open delete work order confirmation", category: "Work Order Management" },
      { name: "workorders.delete", description: "Delete work orders", category: "Work Order Management" },
      { name: "workorders.modal.assign", description: "Open technician assignment modal", category: "Work Order Management" },
      { name: "workorders.assign", description: "Assign technicians to work orders", category: "Work Order Management" },
      { name: "workorders.status", description: "Update work order status", category: "Work Order Management" },
      { name: "workorders.priority", description: "Change work order priority", category: "Work Order Management" },
      { name: "workorders.close", description: "Close completed work orders", category: "Work Order Management" },
      { name: "workorders.search", description: "Search work orders", category: "Work Order Management" },
      { name: "workorders.filter", description: "Filter work orders", category: "Work Order Management" },
      { name: "workorders.export", description: "Export work orders data", category: "Work Order Management" },
      
      // Work Order Details Modal Tabs
      { name: "workorders.tab.overview", description: "View work order overview tab", category: "Work Order Details" },
      { name: "workorders.tab.proposal", description: "View work order proposal tab", category: "Work Order Details" },
      { name: "workorders.tab.parts", description: "View work order parts tab", category: "Work Order Details" },
      { name: "workorders.tab.files", description: "View work order files tab", category: "Work Order Details" },
      { name: "workorders.tab.chat", description: "View work order chat tab", category: "Work Order Details" },
      { name: "workorders.tab.payments", description: "View work order payments tab", category: "Work Order Details" },
      { name: "workorders.tab.invoice", description: "View work order invoice tab", category: "Work Order Details" },
      
      // Proposal Management Page & Modals
      { name: "proposals.page.view", description: "Access proposals page", category: "Proposal Management" },
      { name: "proposals.list.view", description: "View proposals list", category: "Proposal Management" },
      { name: "proposals.modal.create", description: "Open create proposal modal", category: "Proposal Management" },
      { name: "proposals.create", description: "Create new proposals", category: "Proposal Management" },
      { name: "proposals.modal.edit", description: "Open edit proposal modal", category: "Proposal Management" },
      { name: "proposals.edit", description: "Edit proposals", category: "Proposal Management" },
      { name: "proposals.modal.details", description: "Open proposal details modal", category: "Proposal Management" },
      { name: "proposals.modal.delete", description: "Open delete proposal confirmation", category: "Proposal Management" },
      { name: "proposals.delete", description: "Delete proposals", category: "Proposal Management" },
      { name: "proposals.modal.approve", description: "Open proposal approval modal", category: "Proposal Management" },
      { name: "proposals.approve", description: "Approve proposals", category: "Proposal Management" },
      { name: "proposals.modal.reject", description: "Open proposal rejection modal", category: "Proposal Management" },
      { name: "proposals.reject", description: "Reject proposals", category: "Proposal Management" },
      { name: "proposals.search", description: "Search proposals", category: "Proposal Management" },
      { name: "proposals.filter", description: "Filter proposals", category: "Proposal Management" },
      
      // Parts Management Page & Modals
      { name: "parts.page.view", description: "Access parts requests page", category: "Parts Management" },
      { name: "parts.list.view", description: "View parts requests list", category: "Parts Management" },
      { name: "parts.modal.create", description: "Open create parts request modal", category: "Parts Management" },
      { name: "parts.create", description: "Create parts requests", category: "Parts Management" },
      { name: "parts.modal.edit", description: "Open edit parts request modal", category: "Parts Management" },
      { name: "parts.edit", description: "Edit parts requests", category: "Parts Management" },
      { name: "parts.modal.details", description: "Open parts request details modal", category: "Parts Management" },
      { name: "parts.modal.approve", description: "Open parts approval modal", category: "Parts Management" },
      { name: "parts.approve", description: "Approve parts requests", category: "Parts Management" },
      { name: "parts.modal.reject", description: "Open parts rejection modal", category: "Parts Management" },
      { name: "parts.reject", description: "Reject parts requests", category: "Parts Management" },
      { name: "parts.order", description: "Order approved parts", category: "Parts Management" },
      { name: "parts.search", description: "Search parts requests", category: "Parts Management" },
      
      // File Management Modals & Operations
      { name: "files.modal.upload", description: "Open file upload modal", category: "File Management" },
      { name: "files.upload", description: "Upload files", category: "File Management" },
      { name: "files.modal.preview", description: "Open file preview modal", category: "File Management" },
      { name: "files.view", description: "View uploaded files", category: "File Management" },
      { name: "files.download", description: "Download files", category: "File Management" },
      { name: "files.modal.delete", description: "Open file delete confirmation", category: "File Management" },
      { name: "files.delete", description: "Delete files", category: "File Management" },
      { name: "files.categorize", description: "Categorize files", category: "File Management" },
      
      // Communication Modals & Features
      { name: "chat.modal.open", description: "Open chat modal", category: "Communication" },
      { name: "chat.view", description: "View chat messages", category: "Communication" },
      { name: "chat.send", description: "Send chat messages", category: "Communication" },
      { name: "chat.history", description: "View chat history", category: "Communication" },
      { name: "notifications.modal.view", description: "Open notifications modal", category: "Communication" },
      { name: "notifications.view", description: "View notifications", category: "Communication" },
      { name: "notifications.modal.create", description: "Open create notification modal", category: "Communication" },
      { name: "notifications.create", description: "Create notifications", category: "Communication" },
      { name: "notifications.delete", description: "Delete notifications", category: "Communication" },
      { name: "notifications.mark_read", description: "Mark notifications as read", category: "Communication" },
      
      // Payment Management Page & Modals
      { name: "payments.page.view", description: "Access payments page", category: "Payment Management" },
      { name: "payments.list.view", description: "View payment information", category: "Payment Management" },
      { name: "payments.modal.create", description: "Open payment request modal", category: "Payment Management" },
      { name: "payments.create", description: "Create payment requests", category: "Payment Management" },
      { name: "payments.modal.details", description: "Open payment details modal", category: "Payment Management" },
      { name: "payments.modal.approve", description: "Open payment approval modal", category: "Payment Management" },
      { name: "payments.approve", description: "Approve payments", category: "Payment Management" },
      { name: "payments.modal.process", description: "Open payment processing modal", category: "Payment Management" },
      { name: "payments.process", description: "Process payments", category: "Payment Management" },
      { name: "payments.history", description: "View payment history", category: "Payment Management" },
      { name: "payments.technician.view", description: "Access technician payments page", category: "Payment Management" },
      { name: "payments.technician", description: "View technician payments", category: "Payment Management" },
      { name: "payments.search", description: "Search payments", category: "Payment Management" },
      
      // Invoice Management Page & Modals
      { name: "invoices.page.view", description: "Access invoices page", category: "Invoice Management" },
      { name: "invoices.list.view", description: "View invoices list", category: "Invoice Management" },
      { name: "invoices.modal.create", description: "Open create invoice modal", category: "Invoice Management" },
      { name: "invoices.create", description: "Create invoices", category: "Invoice Management" },
      { name: "invoices.modal.edit", description: "Open edit invoice modal", category: "Invoice Management" },
      { name: "invoices.edit", description: "Edit invoices", category: "Invoice Management" },
      { name: "invoices.modal.details", description: "Open invoice details modal", category: "Invoice Management" },
      { name: "invoices.modal.preview", description: "Open invoice preview modal", category: "Invoice Management" },
      { name: "invoices.modal.send", description: "Open send invoice modal", category: "Invoice Management" },
      { name: "invoices.modal.delete", description: "Open delete invoice confirmation", category: "Invoice Management" },
      { name: "invoices.delete", description: "Delete invoices", category: "Invoice Management" },
      { name: "invoices.send", description: "Send invoices to clients", category: "Invoice Management" },
      { name: "invoices.export", description: "Export invoice data", category: "Invoice Management" },
      { name: "invoices.search", description: "Search invoices", category: "Invoice Management" },
      
      // Financial Analysis Page & Features
      { name: "financial.page.view", description: "Access financial analysis page", category: "Financial Analysis" },
      { name: "financial.view", description: "View financial analysis", category: "Financial Analysis" },
      { name: "financial.reports", description: "Generate financial reports", category: "Financial Analysis" },
      { name: "financial.export", description: "Export financial data", category: "Financial Analysis" },
      { name: "financial.charts", description: "View financial charts", category: "Financial Analysis" },
      { name: "financial.comparison", description: "View profit/loss comparison", category: "Financial Analysis" },
      
      // Sidebar Navigation Permissions
      { name: "sidebar.overview", description: "Access overview section", category: "Navigation" },
      { name: "sidebar.user_management", description: "Access user management section", category: "Navigation" },
      { name: "sidebar.operations", description: "Access operations section", category: "Navigation" },
      { name: "sidebar.technicians", description: "Access technicians section", category: "Navigation" },
      { name: "sidebar.payments", description: "Access payments section", category: "Navigation" },
      
      // Button-Level Permissions
      { name: "buttons.create", description: "Show create buttons", category: "Interface Controls" },
      { name: "buttons.edit", description: "Show edit buttons", category: "Interface Controls" },
      { name: "buttons.delete", description: "Show delete buttons", category: "Interface Controls" },
      { name: "buttons.approve", description: "Show approve buttons", category: "Interface Controls" },
      { name: "buttons.reject", description: "Show reject buttons", category: "Interface Controls" },
      { name: "buttons.export", description: "Show export buttons", category: "Interface Controls" },
      { name: "buttons.search", description: "Show search functionality", category: "Interface Controls" },
      { name: "buttons.filter", description: "Show filter functionality", category: "Interface Controls" },
      
      // Advanced Modal Controls  
      { name: "modals.resize", description: "Resize modal windows", category: "Modal Controls" },
      { name: "modals.fullscreen", description: "Fullscreen modal view", category: "Modal Controls" },
      { name: "modals.print", description: "Print modal content", category: "Modal Controls" },
      { name: "modals.bookmark", description: "Bookmark modal content", category: "Modal Controls" },
      
      // Data Export & Import
      { name: "data.export.csv", description: "Export data as CSV", category: "Data Management" },
      { name: "data.export.excel", description: "Export data as Excel", category: "Data Management" },
      { name: "data.export.pdf", description: "Export data as PDF", category: "Data Management" },
      { name: "data.import", description: "Import data from files", category: "Data Management" },
      { name: "data.bulk_operations", description: "Perform bulk operations", category: "Data Management" },
      
      // System Administration & Security
      { name: "system.admin", description: "Full system administration", category: "System Administration" },
      { name: "system.settings", description: "Manage system settings", category: "System Administration" },
      { name: "system.logs", description: "View system logs", category: "System Administration" },
      { name: "system.backup", description: "Create system backups", category: "System Administration" },
      { name: "system.maintenance", description: "Perform system maintenance", category: "System Administration" },
      { name: "system.security", description: "Manage security settings", category: "System Administration" },
      { name: "system.audit", description: "View audit trails", category: "System Administration" }
    ];

    const createdPermissions = await db.insert(permissions).values(permissionData).returning();

    // Create default users
    const hashedPassword = await bcrypt.hash("admin123", 10);
    const [adminUser] = await db.insert(users).values({
      username: "admin",
      email: "admin@example.com",
      password: hashedPassword,
      firstName: "Admin",
      lastName: "User"
    }).returning();

    const managerHash = await bcrypt.hash("manager123", 10);
    const [managerUser] = await db.insert(users).values({
      username: "manager",
      email: "manager@example.com",
      password: managerHash,
      firstName: "Manager",
      lastName: "User"
    }).returning();

    const viewerHash = await bcrypt.hash("viewer123", 10);
    const [viewerUser] = await db.insert(users).values({
      username: "viewer",
      email: "viewer@example.com",
      password: viewerHash,
      firstName: "Viewer",
      lastName: "User"
    }).returning();

    // Assign roles to users
    await db.insert(userRoles).values([
      { userId: adminUser.id, roleId: adminRole.id },
      { userId: managerUser.id, roleId: managerRole.id },
      { userId: viewerUser.id, roleId: viewerRole.id }
    ]);

    // Assign permissions to roles
    const allPermissionIds = createdPermissions.map(p => p.id);
    
    // Admin gets all permissions
    await db.insert(rolePermissions).values(
      allPermissionIds.map(permId => ({ roleId: adminRole.id, permissionId: permId }))
    );

    // Manager gets comprehensive management permissions (excluding system admin)
    const managerPermissionNames = [
      // Dashboard & Analytics
      'dashboard.view', 'dashboard.stats', 'dashboard.widgets', 'analytics.view', 'analytics.export', 'analytics.financial',
      
      // User Management (page access + most modals)
      'users.page.view', 'users.list.view', 'users.modal.create', 'users.create', 'users.modal.edit', 'users.edit', 
      'users.modal.profile', 'users.activate', 'users.reset_password', 'users.search', 'users.filter', 'users.export',
      
      // Role Management (view only)
      'roles.page.view', 'roles.list.view', 'roles.assign', 'permissions.view',
      
      // Technician Management (full access)
      'technicians.page.view', 'technicians.list.view', 'technicians.modal.create', 'technicians.create',
      'technicians.modal.edit', 'technicians.edit', 'technicians.modal.rate', 'technicians.rate',
      'technicians.modal.profile', 'technicians.map.view', 'technicians.map', 'technicians.location', 'technicians.search',
      
      // Work Order Management (full access)
      'workorders.page.view', 'workorders.list.view', 'workorders.modal.create', 'workorders.create',
      'workorders.modal.edit', 'workorders.edit', 'workorders.modal.details', 'workorders.details.view',
      'workorders.modal.assign', 'workorders.assign', 'workorders.status', 'workorders.priority', 'workorders.close',
      'workorders.search', 'workorders.filter', 'workorders.export',
      
      // Work Order Details Tabs
      'workorders.tab.overview', 'workorders.tab.proposal', 'workorders.tab.parts', 'workorders.tab.files',
      'workorders.tab.chat', 'workorders.tab.payments', 'workorders.tab.invoice',
      
      // Proposal Management (full access)
      'proposals.page.view', 'proposals.list.view', 'proposals.modal.create', 'proposals.create',
      'proposals.modal.edit', 'proposals.edit', 'proposals.modal.details', 'proposals.modal.approve', 'proposals.approve',
      'proposals.modal.reject', 'proposals.reject', 'proposals.search', 'proposals.filter',
      
      // Parts Management (full access)
      'parts.page.view', 'parts.list.view', 'parts.modal.create', 'parts.create',
      'parts.modal.edit', 'parts.edit', 'parts.modal.details', 'parts.modal.approve', 'parts.approve',
      'parts.modal.reject', 'parts.reject', 'parts.order', 'parts.search',
      
      // File Management
      'files.modal.upload', 'files.upload', 'files.modal.preview', 'files.view', 'files.download', 'files.categorize',
      
      // Communication
      'chat.modal.open', 'chat.view', 'chat.send', 'chat.history', 'notifications.modal.view', 'notifications.view',
      'notifications.modal.create', 'notifications.create', 'notifications.mark_read',
      
      // Payment Management (full access)
      'payments.page.view', 'payments.list.view', 'payments.modal.create', 'payments.create',
      'payments.modal.details', 'payments.modal.approve', 'payments.approve', 'payments.modal.process', 'payments.process',
      'payments.history', 'payments.technician.view', 'payments.technician', 'payments.search',
      
      // Invoice Management (full access)
      'invoices.page.view', 'invoices.list.view', 'invoices.modal.create', 'invoices.create',
      'invoices.modal.edit', 'invoices.edit', 'invoices.modal.details', 'invoices.modal.preview',
      'invoices.modal.send', 'invoices.send', 'invoices.export', 'invoices.search',
      
      // Financial Analysis
      'financial.page.view', 'financial.view', 'financial.reports', 'financial.export', 'financial.charts', 'financial.comparison',
      
      // Navigation
      'sidebar.overview', 'sidebar.user_management', 'sidebar.operations', 'sidebar.technicians', 'sidebar.payments',
      
      // Interface Controls  
      'buttons.create', 'buttons.edit', 'buttons.approve', 'buttons.reject', 'buttons.export', 'buttons.search', 'buttons.filter',
      
      // Data Management
      'data.export.csv', 'data.export.excel', 'data.export.pdf'
    ];

    const managerPermissions = createdPermissions
      .filter(p => managerPermissionNames.includes(p.name))
      .map(p => p.id);

    await db.insert(rolePermissions).values(
      managerPermissions.map(permissionId => ({
        roleId: managerRole.id,
        permissionId
      }))
    );

    // Technician gets work-focused permissions
    const technicianPermissionNames = [
      // Dashboard
      'dashboard.view', 'dashboard.stats',
      
      // Work Orders (limited access)
      'workorders.page.view', 'workorders.list.view', 'workorders.modal.details', 'workorders.details.view',
      'workorders.edit', 'workorders.status', 'workorders.search', 'workorders.filter',
      
      // Work Order Details Tabs
      'workorders.tab.overview', 'workorders.tab.parts', 'workorders.tab.files', 'workorders.tab.chat',
      
      // Parts (create requests only)
      'parts.modal.create', 'parts.create', 'parts.search',
      
      // Files (basic operations)
      'files.modal.upload', 'files.upload', 'files.modal.preview', 'files.view', 'files.download',
      
      // Communication
      'chat.modal.open', 'chat.view', 'chat.send', 'chat.history', 'notifications.modal.view', 'notifications.view',
      
      // Payments (view own)
      'payments.modal.create', 'payments.create', 'payments.modal.details', 'payments.history',
      
      // Navigation (limited)
      'sidebar.overview', 'sidebar.operations',
      
      // Interface Controls (limited)
      'buttons.search', 'buttons.filter'
    ];

    const technicianPermissions = createdPermissions
      .filter(p => technicianPermissionNames.includes(p.name))
      .map(p => p.id);

    await db.insert(rolePermissions).values(
      technicianPermissions.map(permissionId => ({
        roleId: technicianRole.id,
        permissionId
      }))
    );

    // Viewer gets only view permissions (read-only access)
    const viewerPermissionNames = [
      // Dashboard & Analytics (view only)
      'dashboard.view', 'dashboard.stats', 'analytics.view',
      
      // User Management (view only)
      'users.page.view', 'users.list.view', 'users.modal.profile', 'users.search', 'users.filter',
      
      // Role Management (view only)
      'roles.page.view', 'roles.list.view', 'permissions.view',
      
      // Technician Management (view only)
      'technicians.page.view', 'technicians.list.view', 'technicians.modal.profile',
      'technicians.map.view', 'technicians.map', 'technicians.location', 'technicians.search',
      
      // Work Orders (view only)
      'workorders.page.view', 'workorders.list.view', 'workorders.modal.details', 'workorders.details.view',
      'workorders.search', 'workorders.filter',
      
      // Work Order Details Tabs (view only)
      'workorders.tab.overview', 'workorders.tab.proposal', 'workorders.tab.parts', 'workorders.tab.files',
      'workorders.tab.chat', 'workorders.tab.payments', 'workorders.tab.invoice',
      
      // Proposals (view only)
      'proposals.page.view', 'proposals.list.view', 'proposals.modal.details', 'proposals.search', 'proposals.filter',
      
      // Parts (view only)
      'parts.page.view', 'parts.list.view', 'parts.modal.details', 'parts.search',
      
      // Files (view only)
      'files.modal.preview', 'files.view', 'files.download',
      
      // Communication (view only)
      'chat.view', 'notifications.modal.view', 'notifications.view',
      
      // Payments (view only)
      'payments.page.view', 'payments.list.view', 'payments.modal.details', 'payments.history', 'payments.search',
      
      // Invoices (view only)
      'invoices.page.view', 'invoices.list.view', 'invoices.modal.details', 'invoices.modal.preview', 'invoices.search',
      
      // Financial Analysis (view only)
      'financial.page.view', 'financial.view', 'financial.charts', 'financial.comparison',
      
      // Navigation (all sections but limited functionality)
      'sidebar.overview', 'sidebar.user_management', 'sidebar.operations', 'sidebar.technicians', 'sidebar.payments',
      
      // Interface Controls (search only)
      'buttons.search', 'buttons.filter'
    ];

    const viewerPermissions = createdPermissions
      .filter(p => viewerPermissionNames.includes(p.name))
      .map(p => p.id);

    await db.insert(rolePermissions).values(
      viewerPermissions.map(permissionId => ({
        roleId: viewerRole.id,
        permissionId
      }))
    );

    // Create sample technicians
    await db.insert(technicians).values([
      {
        firstName: "John",
        lastName: "Smith",
        email: "john.smith@example.com",
        phone: "+1-555-0101",
        specialization: "HVAC",
        experience: 5,
        hourlyRate: "75.00",
        location: "Downtown",
        latitude: "40.7128",
        longitude: "-74.0060",
        paymentMethods: JSON.stringify(["bank_transfer", "check"]),
        averageRating: "4.5",
        totalRatings: 12
      },
      {
        firstName: "Sarah",
        lastName: "Johnson",
        email: "sarah.johnson@example.com",
        phone: "+1-555-0102",
        specialization: "Electrical",
        experience: 3,
        hourlyRate: "65.00",
        location: "Uptown",
        latitude: "40.7831",
        longitude: "-73.9712",
        paymentMethods: JSON.stringify(["bank_transfer", "paypal"]),
        averageRating: "4.8",
        totalRatings: 8
      }
    ]);

    console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}