import { createFileRoute } from "@tanstack/react-router";
import { Dashboard2P } from "./tv-geral";

export const Route = createFileRoute("/tv-geral-hd")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "2P Group · Painel HD (TV 50\")" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Dashboard2P canvasPadding={10} fill />,
});
