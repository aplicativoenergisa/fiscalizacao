# Estado da validação

Verificação local em 17/09/2026.

## Aprovado em testes automatizados

- Cadastro de 43 equipes, sem duplicação: DSX 6, RALT 5, ENGELMIG 17, JVP 15.
- Ciclos C1 e C2; transição à meia-noite de MS; fevereiro bissexto, meses e virada do ano.
- Migrations executadas em PostgreSQL embutido (PGlite), incluindo seed, roles e RLS.
- Escrita direta e exclusão de histórico negadas para anon; RPC válida permitida.
- Marcar, desfazer e remarcar preservam eventos; novo ciclo mantém registros anteriores.
- Versão desatualizada rejeitada e repetição do request ID idempotente.
- Duas sessões mobile, com viewport 390×844 e 412×915: confirmação/cancelamento, retirada da aba A Fiscalizar, cartão verde em Finalizadas, recarga preservando estado, desfazer e dois eventos no histórico.
- Atualização entre sessões em menos de cinco segundos com transporte WebSocket simulado e SQL real local. **Não é teste do Supabase Realtime hospedado.**
- Manifest standalone, três variações de ícones e registro do service worker verificados no navegador.
- Layout sem transbordamento horizontal nas duas larguras; imagens das telas inspecionadas visualmente.

## Supabase real — aprovado

- Migrations e seed aplicados diretamente no SQL Editor do projeto `tzcrkhxyrabjbyqxwkty`, na conta aplicativoenergisa. Totais confirmados no banco.
- Teste Playwright sem mocks aprovado contra o Supabase hospedado: duas sessões mobile receberam marcação e retorno automaticamente em menos de cinco segundos; cartão verde, recarga e filtro de equipe no histórico aprovados.
- O indicador Ao vivo aguarda confirmação do PostgreSQL; a confirmação também dispara atualização para recuperar eventos da conexão inicial.
- Os testes reais anteriores criaram seis eventos na equipe RAL-B2 01. Eles foram removidos na limpeza pontual autorizada abaixo, antes da utilização oficial.
- Lint e build de produção aprovados. Revisão do Git confirmou `.env.local`, `.next` e `node_modules` ignorados; varredura dos arquivos preparados não encontrou credenciais.

## Depende do ambiente externo

- PWA: instalar fisicamente pelo Safari iOS e Chrome Android após o deploy HTTPS. O teste local em Edge com viewport mobile não equivale a testar esses navegadores/aparelhos.
- Vercel: importar repositório, configurar as duas variáveis públicas e realizar deploy conforme README. Nenhuma publicação Vercel foi presumida.
- GitHub: conta aplicativoenergisa autenticada no CLI, com permissão de push verificada. O primeiro commit foi publicado na main; a limpeza e a proteção dos testes são registradas em um novo commit. Não há token administrativo no projeto.

Os testes locais não escrevem no Supabase de produção. Nenhum teste real de escrita foi executado após a limpeza.

## Limpeza pontual pré-operação

Verificada no banco em 2026-09-18 às 01:57:19 UTC (17/09, 21:57:19 no horário de MS), mediante solicitação explícita do proprietário.

Foram removidos somente os seis eventos a seguir, todos de `team_id=7` (`RAL-B2 01`), ciclo `2026-09-C2`. Cada linha foi comparada por ID, UUID, ação, timestamp, versão, equipe e ciclo:

- ID 1: `eb9f5df6-f377-48ce-aacf-d9dbe4bf8159`; `inspect`; `2026-09-17T21:57:43.425829+00:00`; versão 1.
- ID 2: `a88369b2-56fc-4446-9bf4-01fe47584f3e`; `undo`; `2026-09-17T21:57:47.520162+00:00`; versão 2.
- ID 3: `a82ec176-aed6-494f-8925-311450582727`; `inspect`; `2026-09-18T01:47:34.349475+00:00`; versão 3.
- ID 4: `7410ad51-e09d-465e-8104-99fe66c2184f`; `undo`; `2026-09-18T01:48:24.579888+00:00`; versão 4.
- ID 5: `b085fbb9-2b73-414f-bf9c-7c344926f32f`; `inspect`; `2026-09-18T01:51:31.401193+00:00`; versão 5.
- ID 6: `4467bd20-bd76-42c5-b340-517ae235002b`; `undo`; `2026-09-18T01:51:34.18073+00:00`; versão 6.

A operação usou uma transação que abortaria se não encontrasse exatamente seis correspondências ou se o estado da equipe tivesse mudado. Não houve DELETE sem filtro, TRUNCATE, reset de sequência, alteração de migrations ou comandos DDL.

O registro em `inspections` foi preservado integralmente: equipe 7, ciclo 2026-09-C2, `inspected_at=null`, `version=6`. Essa versão continua protegendo contra operações de telas antigas; não é uma fiscalização válida nem um evento histórico.

Conferência posterior:

- Quatro empresas e 43 equipes preservadas, com comparação integral dos cadastros antes/depois.
- DSX 6, RALT 5, ENGELMIG 17 e JVP 15.
- 43 equipes em A Fiscalizar no ciclo atual; zero finalizadas.
- `inspection_events`: zero registros em todos os ciclos.
- RLS ativo nas quatro tabelas; quatro policies mantidas.
- `inspections` e `inspection_events` continuam na publicação `supabase_realtime`.
- Nenhuma alteração nas migrations, estrutura, funções ou estado de fiscalização.

Depois da limpeza, os testes foram restritos ao Node/PGlite em memória e ao navegador com transporte simulado. A configuração padrão seleciona apenas `app.spec.ts`, recusa reaproveitar servidores desconhecidos e bloqueia chamadas REST para qualquer origem diferente do mock local. O teste de escrita real não foi executado.
