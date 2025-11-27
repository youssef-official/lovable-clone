"use client";

import { useState } from "react";
import { AdminLogin } from "@/modules/admin/ui/admin-login";
import { AdminDashboard } from "@/modules/admin/ui/admin-dashboard";

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return <AdminLogin onLogin={() => setIsAuthenticated(true)} />;
  }

  return <AdminDashboard />;
}
