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
- Os testes reais e a recuperação de um teste interrompido deixaram seis eventos de auditoria na equipe RAL-B2 01, terminando pendente. Nenhum evento foi apagado.
- Lint e build de produção aprovados. Revisão do Git confirmou `.env.local`, `.next` e `node_modules` ignorados; varredura dos arquivos preparados não encontrou credenciais.

## Depende do ambiente externo

- PWA: instalar fisicamente pelo Safari iOS e Chrome Android após o deploy HTTPS. O teste local em Edge com viewport mobile não equivale a testar esses navegadores/aparelhos.
- Vercel: importar repositório, configurar as duas variáveis públicas e realizar deploy conforme README. Nenhuma publicação Vercel foi presumida.
- GitHub: conta aplicativoenergisa autenticada no CLI, com permissão de push verificada. O código será publicado na main; confira o commit no repositório. Não há token administrativo no projeto.

Os testes simulados não escrevem no Supabase de produção. Depois da configuração, testes reais de marcar/desfazer criarão eventos permanentes de auditoria.
