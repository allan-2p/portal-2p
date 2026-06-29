## Redesign da tela de login — Bento Cinematográfico Claro

Visão: tela `/auth` deixa de ser split simples (imagem + form) e vira uma **composição bento clara** com identidade 2P, sensação de produto premium tipo Linear/Vercel/Arc, mantendo o laranja como protagonista.

### Direção visual
- **Paleta:** fundo `#fafbfc`, superfícies brancas, tinta `#1a1a2e`, acento `#ff6b35`. Sem dark hero — claro o tempo todo (com toggle preservado).
- **Tipografia:** Space Grotesk display + DM Sans body, via `@fontsource`. Headline grande (`text-5xl/6xl tracking-tight`) com palavra-chave em laranja.
- **Energia:** cinematográfica e premium — gradientes sutis, grid de fundo leve, glow laranja controlado, animações de entrada com `framer-motion` (fade + slide stagger).

### Layout (desktop ≥ lg)

```text
┌────────────────────────────────────────────────────────────────┐
│  [logo 2P] Portal 2P                          [tema] [PT-BR]   │
├──────────────────────────┬─────────────────────────────────────┤
│  HERO BENTO (col-span-7) │  FORM CARD (col-span-5)             │
│  Headline gigante:       │  "Entrar na sua conta"              │
│  "Inteligência que       │  email / senha / botão laranja      │
│   move metas."           │  esqueci minha senha                 │
│  Sub + tag laranja        │                                     │
│                          │                                     │
├─────────┬────────┬───────┤                                     │
│ STAT 1  │ STAT 2 │ TAG   │                                     │
│ +R$ X M │ 1.2k   │ Atlas │                                     │
│ vendido │ pedid. │ AI ◐  │                                     │
├─────────┴────────┴───────┤                                     │
│ FRASE: "Inovação e       │                                     │
│ parceria é o que nos     │                                     │
│ move!"  — diretoria 2P   │                                     │
└──────────────────────────┴─────────────────────────────────────┘
```

Mobile: stack vertical — form primeiro, bento abaixo compactado.

### Blocos do bento (lado esquerdo)
1. **Hero card grande** — headline em Space Grotesk, palavra "metas" em `text-primary`, sub em muted, micro-tag "Portal interno · time 2P" com bolinha pulsante laranja.
2. **Stat cards (2)** — números mock representativos ("R$ 38M vendido no mês", "1.2k pedidos ativos") em Space Grotesk bold, label menor. Bordas suaves, fundo branco, sombra `shadow-sm`.
3. **Tag Atlas** — card menor com ícone `Sparkles` laranja, "Atlas AI · sugestões em tempo real", gradiente sutil laranja→transparente.
4. **Quote card** — frase "Inovação e parceria é o que nos move!" em itálico Space Grotesk, com filete laranja à esquerda e assinatura discreta.

Fundo do hero: grid sutil de pontos (radial mask) + blob laranja desfocado no canto inferior esquerdo (`blur-3xl opacity-30`) para profundidade cinematográfica sem perder o claro.

### Form card (direita)
- Card branco `rounded-2xl border shadow-lg` flutuante, com leve glow laranja por trás (`::before` blur).
- Topo: chip "Acesso restrito" com ícone cadeado.
- Campos com label flutuante minimalista, foco com ring laranja.
- Botão primário em laranja sólido, hover com leve scale + sombra colorida.
- Footer do card: separador "ou" + linha discreta "Problemas para acessar? Fale com o admin".
- Toggle de tema permanece no canto superior direito (fora do card).

### Animações (framer-motion)
- Entrada da página: stagger dos blocos do bento (y: 12→0, opacity 0→1, 60ms entre cada).
- Hover dos stat cards: leve `translateY(-2px)` + sombra mais intensa.
- Bolinha "ao vivo" pulsando no tag superior.
- Form: shake sutil em erro de login (já temos toast, adicionar shake no card).

### Implementação técnica
- Instalar `@fontsource/space-grotesk` e `@fontsource/dm-sans` via `bun add`, importar em `src/start.ts` (entry global).
- Confirmar tokens em `src/styles.css` — paleta light atual já compatível, apenas ajustar `--primary` para casar com `#ff6b35` se necessário.
- Reescrever `src/routes/auth.tsx`:
  - Grid `lg:grid-cols-12` com `gap-4 p-6`.
  - Componentes locais `BentoCard`, `StatCard`, `QuoteCard` no mesmo arquivo (sem novos arquivos globais — escopo local da rota).
  - Manter toda a lógica de auth (`handleSubmit`, `resetMode`, redirect) intacta.
- `framer-motion` já está disponível? Se não, `bun add framer-motion`.
- Imagem `src/assets/auth-bg.jpg` deixa de ser usada como fundo full-bleed; pode ser removida ou reaproveitada como textura sutil dentro de um dos cards menores (decido na implementação — provavelmente removida para manter o claro).

### Fora do escopo
- Não muda lógica de autenticação, rotas protegidas, ou reset de senha.
- Não muda o resto do app (header, sidebar, home).
- Não adiciona dark hero — tema claro é o default desta tela; toggle continua funcionando.
