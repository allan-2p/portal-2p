import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTasksTool from "./tools/list-tasks";
import createTaskTool from "./tools/create-task";
import listClientesTool from "./tools/list-clientes";
import listProposalsTool from "./tools/list-proposals";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged and is inlined at build time.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "portal-2p",
  title: "Portal 2P",
  version: "0.1.0",
  instructions:
    "Ferramentas do Portal 2P. Use `list_tasks` e `create_task` para a agenda de tarefas, `list_clientes` para buscar clientes cadastrados e `list_proposals` para consultar propostas comerciais. Todas as operações são executadas como o usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTasksTool, createTaskTool, listClientesTool, listProposalsTool],
});
