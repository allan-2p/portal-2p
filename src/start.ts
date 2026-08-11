import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { applySecurityHeaders } from "./lib/security-headers";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const securityHeadersMiddleware = createMiddleware().server(async ({ next, request }) => {
  const response = await next();
  if (new URL(request.url).pathname.startsWith("/lovable/")) {
    return response;
  }
  const result = (response as unknown as { response?: Response }).response;
  if (result instanceof Response) {
    (response as unknown as { response: Response }).response = applySecurityHeaders(
      result,
      import.meta.env.PROD,
    );
  }
  return response;
});

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {

  if (new URL(request.url).pathname.startsWith("/lovable/")) {
    return next();
  }
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // Let auth errors bubble through untouched so the client receives the
    // failed RPC (and the _authenticated gate can redirect to /auth) instead
    // of an HTML 500 page that blanks the screen.
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware],
}));

