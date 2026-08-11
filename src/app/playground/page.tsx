import { AppShell } from "@/components/app-shell";
import { Playground } from "@/components/playground";

export default function PlaygroundPage() {
  return <AppShell active="playground" compact><Playground projectId={null} projectName="빈 플레이그라운드" hasPassword={false} /></AppShell>;
}
