# Fiscalização

PWA mobile-first em Next.js, React e TypeScript para 43 equipes: DSX 6, RALT 5, ENGELMIG 17 e JVP 15. Sem login ou identificação do técnico. Banco e sincronização via Supabase. Hospedagem preparada para Vercel.

## Instalar e rodar

Use Node.js 22.18 ou superior (recomendado 24 LTS) e pnpm 11.19.0. Na pasta do projeto:

```sh
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
```

Copie `.env.example` para `.env.local` (PowerShell: `Copy-Item .env.example .env.local`). Preencha:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://tzcrkhxyrabjbyqxwkty.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=COLE_A_CHAVE_PUBLICA_DO_PROJETO
```

Obtenha a chave **Publishable** nas configurações do projeto Supabase, em **API Keys**. A chave pública é enviada ao navegador por definição; não é uma credencial administrativa. Nunca use senha de banco, secret key ou service_role. `.env.local` está ignorado pelo Git.

```sh
pnpm dev
```

Abra http://localhost:3000. Sem configuração, o cadastro aparece com aviso e as mutations ficam desativadas; não há dados fictícios de fiscalização.

## Configurar Supabase

**Projeto informado já configurado nesta entrega:** as duas migrations foram aplicadas e as 43 equipes conferidas. Não execute novamente nesse banco. As instruções abaixo servem para reproduzir a configuração em um banco vazio.

1. Abra o projeto `tzcrkhxyrabjbyqxwkty` no dashboard do Supabase.
2. Entre em **SQL Editor → New query**.
3. Copie e execute o conteúdo completo de `supabase/migrations/202609170001_schema.sql`.
4. Em uma nova consulta, execute `supabase/migrations/202609170002_seed.sql`.
5. Execute `select company_id, count(*) from public.teams group by company_id;`. Esperado: DSX 6, RALT 5, ENGELMIG 17, JVP 15.
6. Em **Database → Publications → supabase_realtime**, confira `inspections` e `inspection_events` habilitadas. A primeira migration já as adiciona. Dependendo da versão do dashboard, o controle também aparece nas configurações de Replication/Realtime.
7. Confira que RLS está habilitado nas quatro tabelas. Não crie policies de escrita para anon.

As migrations destinam-se a um banco onde esses objetos ainda não existem. Aplique uma vez, na ordem; não reaplique o seed em produção. Se usar Supabase CLI, vincule o projeto com `supabase link --project-ref tzcrkhxyrabjbyqxwkty` e use `supabase db push` em vez do SQL Editor. Não use os dois métodos para aplicar a mesma migration sem reconciliar o histórico do CLI.

## Modelo, ciclos e concorrência

- `companies` e `teams`: cadastro completo, sem filtro de ativo/inativo. `lib/teams.json` espelha o seed para renderização imediata; mudanças futuras no cadastro devem atualizar ambos.
- `inspections`: uma linha por equipe/ciclo, chave primária composta. `inspected_at` nulo representa pendência. `version` permite detectar uma tela desatualizada.
- `inspection_events`: trilha de eventos de marcar e retornar, com data/hora, ciclo, versão e identificador de operação. Desfazer não apaga eventos.
- `current_inspection_cycle()`: dia 1–15 = C1; 16–fim = C2. Fuso único **America/Campo_Grande (MS)**, assumido pelas equipes CGR. O relógio do banco decide o ciclo e os timestamps. Se o fuso de operação mudar, altere a função SQL e `lib/cycle.ts` juntos.
- `set_inspection(...)`: único caminho público de escrita. Valida equipe, ação, ciclo atual e versão; bloqueia a equipe durante a transação; grava status e evento atomicamente; rejeita operações concorrentes desatualizadas. Repetir o mesmo request ID não duplica eventos.
- Novo ciclo apenas muda a consulta. Não há cron de reset, exclusão ou atualização de ciclos antigos.
- Supabase Postgres Changes atualiza os dispositivos. Reconexão, retorno à aba e consulta de recuperação a cada 15 segundos corrigem eventos perdidos. O app exibe o estado de conexão.

## Segurança sem autenticação

O app é público: qualquer pessoa com acesso à URL ou à chave pública pode consultar o histórico e chamar a função de marcar/desfazer. Sem identidade, não é possível distinguir os quatro técnicos de terceiros nem atribuir eventos a pessoas. Não insira informações pessoais/confidenciais nas tabelas.

RLS e permissões autorizam somente SELECT direto; INSERT, UPDATE e DELETE são negados aos clientes. A função SECURITY DEFINER tem `search_path` vazio, referências qualificadas e permissões de execução explícitas. Não há SQL dinâmico. O servidor define ciclo/hora; o cliente não pode gravar retroativamente. Há limite de 12 alterações por equipe/minuto, aplicado no banco, para reduzir abuso simples; isso não impede negação de serviço nem substitui autenticação. Um cliente malicioso pode consumir esse limite e prejudicar usuários legítimos.

Uma API Next.js usando a mesma publishable key não esconderia a RPC nem criaria autorização. Por isso, a validação está no banco, onde também protege chamadas fora da interface. Nenhuma chave administrativa é necessária. Para restringir acesso de verdade no futuro, adicione uma forma de autenticação e políticas correspondentes; isso altera a exigência atual de acesso público.

## Deploy na Vercel

1. Entre na Vercel → **Add New → Project**.
2. Conecte sua conta GitHub e autorize o repositório **aplicativoenergisa/fiscalizacao**. Clique em **Import**.
3. Nome do projeto: **fiscalizacao**. Framework Preset: **Next.js**. Root Directory: raiz do repositório (`./`). Branch de produção: **main**.
4. Em **Environment Variables**, adicione `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os valores acima, em Production (e Preview/Development se desejado).
5. Build Command: `pnpm build`; Install Command: `pnpm install --frozen-lockfile`; mantenha o diretório de saída padrão do Next.js. Node.js: 24.x.
6. Clique em **Deploy**. Abra a URL HTTPS fornecida pela Vercel. Não se presume que um domínio específico esteja disponível.
7. Se alterar variáveis públicas depois, faça **Redeploy**: Next.js incorpora os valores no build.
8. Se a Vercel ativar proteção de acesso no domínio de produção, ajuste em **Settings → Deployment Protection** para permitir o acesso público exigido pelo app.

## Instalar no celular

**iPhone:** abra a URL HTTPS no Safari → Compartilhar → Adicionar à Tela de Início → confirme “Fiscalização”. Abra pelo ícone criado. O menu varia conforme a versão do iOS.

**Android:** abra a URL HTTPS no Chrome → menu ⋮ → Instalar app ou Adicionar à tela inicial → confirme.

O manifest possui nome, modo standalone, ícones 192/512 e maskable; iOS possui apple-touch-icon. O service worker oferece uma página de indisponibilidade offline. O registro de fiscalização exige internet e nunca é silenciosamente enfileirado. Ao reabrir online, os dados vêm do Supabase. Valide instalação em aparelhos físicos após o deploy.

## Logos e atualização

As logos fornecidas pelo proprietário estão em `public/logos/ralt.png`, `jvp.png`, `dsx.png` e `engelmig.png`, em versões PNG tratadas para nitidez a partir dos JPEGs enviados. Os cartões preservam as proporções com `object-fit: contain` e mantêm o nome da empresa visível ao lado. Os ícones do aplicativo ficam em `public/`.

Para atualizar: altere o código, execute os checks abaixo, crie commit e faça push na main. A integração GitHub/Vercel publica automaticamente. Mudanças de banco devem ser novas migrations, nunca apagar histórico. Ao mudar arquivos offline, incremente `CACHE` em `public/sw.js`. A aplicação principal usa rede, não um cache de HTML antigo.

## Validação

```sh
pnpm lint
pnpm test
pnpm build
pnpm exec playwright test
```

Os testes unitários usam o Node nativo. Os testes SQL executam as migrations reais em PGlite (PostgreSQL embutido), com roles anon/authenticated. O teste de interface usa Edge instalado, duas sessões em tamanhos mobile e um transporte Supabase simulado sobre o SQL real. Ele não depende da chave real e não comprova o serviço Realtime hospedado. Em Linux, instale Edge ou altere `channel` no `playwright.config.ts` e instale Chromium via Playwright.

A validação real do Supabase foi concluída antes da limpeza de pré-operação. Os seis eventos de teste foram removidos de forma pontual a pedido do proprietário; o banco foi conferido com 43 equipes pendentes e histórico vazio. Consulte `VALIDACAO.md` para os identificadores e resultados.

A configuração Playwright padrão executa somente o teste local com banco em memória e transporte simulado; chamadas REST externas são bloqueadas. O arquivo `e2e/live.spec.ts` é mantido como referência da validação anterior, fora da suíte padrão. Não o execute no banco oficial: ele cria eventos permanentes. Testes posteriores à limpeza devem usar `pnpm test` e `pnpm exec playwright test`. A instalação em aparelhos físicos ainda pode ser validada após o deploy sem marcar equipes.

## Arquivos principais

- `components/dashboard.tsx`: empresas, equipes, confirmação, histórico e subscriptions.
- `app/globals.css`: layout mobile e cores de status.
- `lib/cycle.ts`, `lib/supabase.ts`, `lib/teams.json`: ciclo, conexão e cadastro.
- `supabase/migrations/202609170001_schema.sql`: schema, RLS, RPCs e Realtime.
- `supabase/migrations/202609170002_seed.sql`: quatro empresas e 43 equipes.
- `public/manifest.json`, `public/sw.js`, `public/offline.html`: PWA.
- `tests/`, `e2e/`: testes automatizados.

Referências: [Next.js PWA](https://nextjs.org/docs/app/guides/progressive-web-apps), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database Functions](https://supabase.com/docs/guides/database/functions), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
