import { AppShell } from "@/components/app-shell";
import { Playground } from "@/components/playground";

export default function PlaygroundPage() {
  return <AppShell active="playground" compact><Playground /></AppShell>;
}
