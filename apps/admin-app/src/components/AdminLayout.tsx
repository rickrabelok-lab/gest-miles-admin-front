import AdminAppLayout from "@/components/admin/AdminAppLayout";
import MissingSupabaseConfig from "@/components/MissingSupabaseConfig";
import { AdminEquipeProvider } from "@/context/AdminEquipeContext";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function AdminLayout() {
  if (!isSupabaseConfigured) {
    return <MissingSupabaseConfig />;
  }

  return (
    <AdminEquipeProvider>
      <AdminAppLayout />
    </AdminEquipeProvider>
  );
}
