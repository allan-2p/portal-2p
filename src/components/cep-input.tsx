import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

export type EnderecoCep = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export const soDigitosCep = (v: string) => v.replace(/\D/g, "").slice(0, 8);

export function formatarCep(v: string) {
  const d = soDigitosCep(v);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const d = soDigitosCep(cep);
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, string> & { erro?: boolean | string };
    if (j.erro) return null;
    return {
      cep: formatarCep(d),
      logradouro: j['logradouro'] ?? "",
      complemento: j['complemento'] ?? "",
      bairro: j['bairro'] ?? "",
      cidade: j['localidade'] ?? "",
      uf: j['uf'] ?? "",
    };
  } catch {
    return null;
  }
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  onFound: (e: EnderecoCep) => void;
  placeholder?: string;
  disabled?: boolean;
};

/** Campo de CEP com busca automática (ViaCEP) — uso em todo o portal. */
export function CepInput({ value, onChange, onFound, placeholder = "00000-000", disabled }: Props) {
  const [loading, setLoading] = useState(false);

  const buscar = async (raw: string) => {
    if (soDigitosCep(raw).length !== 8 || loading) return;
    setLoading(true);
    const end = await buscarCep(raw);
    setLoading(false);
    if (!end) {
      toast.error("CEP não encontrado.");
      return;
    }
    onFound(end);
    toast.success("Endereço preenchido pelo CEP.");
  };

  return (
    <div className="flex gap-2">
      <Input
        value={formatarCep(value ?? "")}
        inputMode="numeric"
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const v = formatarCep(e.target.value);
          onChange(v);
          if (soDigitosCep(v).length === 8) void buscar(v);
        }}
        onBlur={(e) => void buscar(e.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled || loading}
        onClick={() => void buscar(value)}
        aria-label="Buscar CEP"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      </Button>
    </div>
  );
}
