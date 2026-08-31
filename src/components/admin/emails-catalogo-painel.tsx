import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EMAILS_CATALOGO, previewEmail, type EmailCatalogoItem } from "@/lib/emails-catalogo";

function Item({ item }: { item: EmailCatalogoItem }) {
  const [previa, setPrevia] = useState(false);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{item.nome}</h3>
              <Badge variant="secondary">{item.categoria}</Badge>
              {item.rotulosLog.map((r) => (
                <Badge key={r} variant="outline" className="font-mono text-[11px]">
                  {r}
                </Badge>
              ))}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              <strong className="font-medium text-foreground">Assunto:</strong> {item.assunto}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPrevia((v) => !v)}>
            {previa ? "Ocultar prévia" : "Ver prévia"}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Quando dispara</p>
              <p>{item.quando}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Quem recebe</p>
              <p>{item.destinatarios}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">O que vai no corpo</p>
              <ul className="list-disc pl-4">
                {item.conteudo.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Como funciona</p>
              <ul className="list-disc pl-4">
                {item.funcionamento.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Origem no código</p>
              <p className="font-mono text-xs text-muted-foreground">{item.origem}</p>
            </div>
          </div>
        </div>

        {previa ? (
          <div className="overflow-hidden rounded-lg border bg-muted/30">
            <iframe
              title={`Prévia do e-mail ${item.nome}`}
              srcDoc={previewEmail(item)}
              sandbox=""
              className="h-[420px] w-full border-0 bg-white"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function EmailsCatalogoPainel() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Tipos de e-mail da plataforma</h2>
        <p className="text-sm text-muted-foreground">
          Todos os e-mails que o Portal 2P dispara: gatilho, destinatários, conteúdo e prévia com
          dados de exemplo. O rodapé com link de descadastro é acrescentado pela plataforma de envio
          em todo e-mail de negócio.
        </p>
      </div>
      {EMAILS_CATALOGO.map((item) => (
        <Item key={item.id} item={item} />
      ))}
    </div>
  );
}
