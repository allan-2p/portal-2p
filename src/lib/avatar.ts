import { supabase } from "@/integrations/supabase/client";

const urlCache = new Map<string, { url: string; exp: number }>();

/**
 * Resolves a storage path (e.g. "<user_id>/avatar-123.png") into a signed URL.
 * Caches for ~50 minutes. Returns null when the path is empty or fails.
 */
export async function resolveAvatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  // already a full URL (legacy)
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const cached = urlCache.get(path);
  const now = Date.now();
  if (cached && cached.exp > now) return cached.url;
  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, exp: now + 50 * 60 * 1000 });
  return data.signedUrl;
}

export function invalidateAvatarCache(path?: string | null) {
  if (!path) {
    urlCache.clear();
    return;
  }
  urlCache.delete(path);
}

/**
 * Uploads a file as the avatar for `userId`. Returns the new storage path.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (file.size > 4 * 1024 * 1024) throw new Error("Imagem muito grande (máx 4MB).");
  if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/avatar-${Date.now()}.${ext || "png"}`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw new Error(upErr.message);

  // fetch previous path to clean up old file(s) (best-effort)
  const { data: prof } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();
  const previous = prof?.avatar_url as string | null | undefined;

  const { error: updErr } = await supabase
    .from("profiles")
    .update({ avatar_url: path })
    .eq("id", userId);
  if (updErr) throw new Error(updErr.message);

  if (previous && previous !== path && !previous.startsWith("http")) {
    supabase.storage.from("avatars").remove([previous]).catch(() => {});
    invalidateAvatarCache(previous);
  }
  invalidateAvatarCache(path);
  return path;
}

export function useAvatarUrl(path: string | null | undefined): string | null {
  // simple hook wrapping resolveAvatarUrl
  // kept here to avoid extra files; React import lazy-loaded by caller
  throw new Error("Use useAvatarUrl from hooks/use-avatar-url");
}
