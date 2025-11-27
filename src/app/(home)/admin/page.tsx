import { AdminView } from "@/modules/admin/ui/views/admin-view";
import { auth } from "@clerk/nextjs/server";
import { AUTHORIZED_ADMIN_USER_ID } from "@/lib/constants";
import { redirect } from "next/navigation";

export default function AdminPage() {
  const { userId } = auth();

  if (userId !== AUTHORIZED_ADMIN_USER_ID) {
    // Redirect to home page if not the authorized admin
    redirect("/");
  }

  return <AdminView />;
}
