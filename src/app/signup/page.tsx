import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/lib/auth";

export default async function SignupPage() {
  if (await currentUser()) redirect("/");
  return <AuthForm mode="signup" />;
}
