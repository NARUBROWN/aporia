import { redirect } from "next/navigation";
import { ProjectOnboarding } from "@/components/project-onboarding";
import { currentUser } from "@/lib/auth";

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user) redirect("/signup");
  return <ProjectOnboarding name={user.name} />;
}
