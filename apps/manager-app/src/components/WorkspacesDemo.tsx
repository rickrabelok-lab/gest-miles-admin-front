import * as React from "react";
import {
  Workspaces,
  WorkspaceTrigger,
  WorkspaceContent,
  type Workspace,
} from "@/components/ui/workspaces";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";

interface MyWorkspace extends Workspace {
  logo: string;
  plan: string;
  slug: string;
}

const workspaces: MyWorkspace[] = [
  {
    id: "1",
    name: "Asme Inc.",
    logo:
      "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=128&q=80",
    plan: "Free",
    slug: "asme",
  },
  {
    id: "2",
    name: "Bilux Labs",
    logo:
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=128&q=80",
    plan: "Pro",
    slug: "bilux",
  },
  {
    id: "3",
    name: "Zentra Ltd.",
    logo:
      "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=128&q=80",
    plan: "Team",
    slug: "zentra",
  },
];

export default function WorkspacesDemo() {
  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState("1");

  const handleWorkspaceChange = (workspace: MyWorkspace) => {
    setActiveWorkspaceId(workspace.id);
  };

  return (
    <div className="flex items-start justify-center px-4 py-8">
      <Workspaces
        workspaces={workspaces}
        selectedWorkspaceId={activeWorkspaceId}
        onWorkspaceChange={handleWorkspaceChange}
      >
        <WorkspaceTrigger className="min-w-72" />
        <WorkspaceContent searchable>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground w-full justify-start"
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            Create workspace
          </Button>
        </WorkspaceContent>
      </Workspaces>
    </div>
  );
}

