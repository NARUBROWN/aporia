import { AppShell, Topbar } from "@/components/app-shell";
import { AccountSettings } from "@/components/account-settings";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <AppShell active="settings"><Topbar title="설정" /><main className="page-content narrow"><AccountSettings username={user.username} name={user.name} /></main></AppShell>;
}
