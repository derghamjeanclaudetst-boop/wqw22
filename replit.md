# replit.md

## Overview

This is a full-stack web application for managing a comprehensive role-based access control (RBAC) admin panel. It facilitates user and role management, alongside specialized systems for technician management, work order processing, proposals, parts requests, file handling, internal communication (chat), payment processing, invoicing, and financial analysis. The application aims to provide a robust, secure, and user-friendly platform for operational oversight and management.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Deployment Success
- **Date:** August 1, 2025
- **Status:** Successfully deployed to VPS server
- **Server:** Ubuntu VPS with PostgreSQL database
- **Database:** postgresql://workorder_admin:workorder123@localhost:5432/workorder_db
- **Access:** http://server-ip:3000 with admin@example.com / admin123
- **Resolution:** Fixed Node.js 18 compatibility issues with Vite configuration and PostgreSQL imports

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables
- **Form Management**: React Hook Form with Zod validation
- **UI/UX Decisions**: Modern, professional design with gradient backgrounds, improved animations, and polished visual elements. Features custom scrollbars, enhanced login page design, and a personalized dashboard.
- **Feature Specifications**: Comprehensive authentication and authorization, CRUD operations for users and roles, technician management including map view, work order management with multi-tab detail views, proposal approval system, parts request management with workflow, file upload system for various document types, real-time chat for work order communication, integrated payment request and management, invoice approval workflow (request → pending_approval → approved/rejected with notifications → locks work order), and financial analysis for profit/loss tracking. A comprehensive notification system provides real-time alerts.
- **Invoice Workflow**: Work order Invoice tab shows a "Request Invoice" button that auto-populates from approved technician payments (labor) + approved parts (materials) + tax input. Submitting sets status to `pending_approval`. Payment Manager shows an "Invoice Requests" tab (filtered to assigned work orders only, admin sees all) with Approve (locks work order) and Reject (notifies requester) actions. Rejected invoices can be re-requested.
- **Payment Request Workflow**: Work order Payment tab → Create Payment Request modal (technician, amount, payment method, priority, description). Submitted requests go to Payment Manager "Payment Requests" tab (filtered to assigned work orders only, admin sees all). Payment Manager flow: Approve (with adjustable amount + W9 check for >$500) → Pay button (full or partial, accumulates amountPaid, updates status to `partially_paid`/`paid`) or Reject (with reason, notifies requester). Full payment history per technician accessible from any row.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM
- **Database Provider**: PostgreSQL
- **Session Management**: Express sessions with `connect-pg-simple` for PostgreSQL session storage
- **Authentication**: Session-based with bcrypt password hashing
- **Authorization**: Granular Role-Based Access Control (RBAC) middleware supporting over 150 permissions across various categories (e.g., Dashboard, User Management, Work Orders, Payments). Includes specialized permission guards (PageGuard, ModalGuard, ButtonGuard, TabGuard, SidebarGuard) for precise control.

### Database Schema
The application utilizes a comprehensive PostgreSQL schema for RBAC, users, roles, permissions, and all operational data related to technicians, work orders, proposals, parts, files, chats, payments, and invoices.

### System Design Choices
- **Authentication System**: Session-based authentication with bcrypt hashing and protected routes.
- **Authorization System**: RBAC implementation with granular permissions, permission-based route protection, and frontend permission guards.
- **Data Flow**: Authentication, authorization, and data management (using TanStack Query for API state, optimistic updates, and real-time synchronization) are all integrated and enforced end-to-end.
- **Deployment Strategy**: Configured for Replit deployment, utilizing Vite for frontend builds and esbuild for backend compilation.

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL database connection
- **drizzle-orm**: Type-safe database ORM
- **bcrypt**: Password hashing
- **express-session**: Session management
- **connect-pg-simple**: PostgreSQL session store
- **multer**: File upload handling
- **OpenStreetMap**: For technician map view integration

### UI Dependencies
- **@radix-ui/***: Headless UI primitives
- **@tanstack/react-query**: Server state management
- **react-hook-form**: Form state management
- **zod**: Schema validation
- **tailwindcss**: Utility-first CSS framework
- **shadcn/ui**: Component library
- **i18next + react-i18next**: Full Arabic/English internationalization with RTL layout support

### Development Dependencies
- **vite**: Build tool and development server
- **typescript**: Type safety
- **tsx**: TypeScript execution for Node.js
- **esbuild**: Fast JavaScript bundler