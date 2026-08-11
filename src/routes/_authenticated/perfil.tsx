import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera, Loader2, User as UserIcon, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { useAuth, refreshAuthProfile, ROLE_LABELS } from "@/hooks/use-auth";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { uploadAvatar } from "@/lib/avatar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil — Portal 2P" },
      {
        name: "description",
        content:
          "Gerencie seus dados pessoais, foto e preferências da sua conta no Portal 2P.",
      },
      { property: "og:title", content: "Meu perfil — Portal 2P" },
      {
        property: "og:description",
        content:
          "Gerencie seus dados pessoais, foto e preferências da sua conta no Portal 2P.",
      },
      { property: "og:url", content: "/perfil" },
    ],
    links: [{ rel: "canonical", href: "/perfil" }],
  }),

  component: PerfilPage,
});

function PerfilPage() {
  const { user, profile, roles, loading } = useAuth();
  const avatarUrl = useAvatarUrl(profile?.avatar_url);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [cargo, setCargo] = useState(profile?.cargo ?? "");
  const [cargoTipo, setCargoTipo] = useState(profile?.cargo_tipo ?? "");

  // keep form in sync if profile loads later
  if (profile && fullName === "" && profile.full_name) {
    setFullName(profile.full_name);
  }

  async function handleFile(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      await uploadAvatar(user.id, file);
      await refreshAuthProfile();
      toast.success("Foto atualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, cargo: cargo || null, cargo_tipo: cargoTipo || null })
        .eq("id", user.id);
      if (error) throw error;
      await refreshAuthProfile();
      toast.success("Perfil atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingName(false);
    }
  }

  if (loading || !user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const initials = (profile?.full_name ?? user.email ?? "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <div className="flex items-start gap-6 bg-card border border-border rounded-2xl p-6">
          <div className="relative group">
            <div className="h-28 w-28 rounded-full overflow-hidden bg-gradient-to-br from-primary to-[oklch(0.62_0.22_25)] flex items-center justify-center text-3xl font-bold text-primary-foreground ring-4 ring-background shadow-lg">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 h-9 w-9 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-60"
              aria-label="Trocar foto"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-2xl">{profile?.full_name ?? "—"}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {roles.map((r) => (
                <span
                  key={r}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium"
                >
                  {ROLE_LABELS[r]}
                </span>
              ))}
              {profile?.equipe && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-2 text-muted-foreground">
                  {profile.equipe}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" />
              Clique no ícone da câmera para enviar uma nova foto (PNG/JPG, até 4MB).
            </p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-lg">Dados pessoais</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome completo">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Cargo">
              <input value={cargo} onChange={(e) => setCargo(e.target.value)} className="input" placeholder="Ex.: Gerente Comercial" />
            </Field>
            <Field label="Especialização (para versões de tela)">
              <input
                value={cargoTipo}
                onChange={(e) => setCargoTipo(e.target.value)}
                className="input"
                placeholder="Ex.: Closer, Farmer, SDR, Regional, Performance"
                list="cargo-tipo-suggestions"
              />
              <datalist id="cargo-tipo-suggestions">
                <option value="Closer" />
                <option value="Farmer" />
                <option value="SDR" />
                <option value="Hunter" />
                <option value="Regional" />
                <option value="Nacional" />
                <option value="Comercial" />
                <option value="Executivo" />
                <option value="Performance" />
                <option value="Branded" />
                <option value="Growth" />
              </datalist>
              <p className="text-[11px] text-muted-foreground mt-1">
                Define qual variante de tela você recebe automaticamente (ex.: Vendedor · Closer).
              </p>
            </Field>
            <Field label="E-mail">
              <input value={user.email ?? ""} disabled className="input opacity-70" />
            </Field>
            <Field label="Equipe">
              <input value={profile?.equipe ?? "—"} disabled className="input opacity-70" />
            </Field>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={savingName}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2"
            >
              {savingName && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar alterações
            </button>
          </div>
        </div>
      </div>

      <style>{`.input{width:100%;padding:0.55rem 0.75rem;border-radius:0.5rem;background:hsl(var(--background));border:1px solid hsl(var(--border));font-size:0.875rem;outline:none}.input:focus{border-color:hsl(var(--primary))}`}</style>
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
