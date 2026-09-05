# Auditoria da operação editorial

Data: 5 de setembro de 2026. Escopo: código local, migrações, fluxo de importação e condições de acesso para publicação. A revisão inicial abaixo registra problemas encontrados antes da refatoração desta versão; a lista de liberação distingue implementação de verificação em produção.

## Achados na versão inicial

| Prioridade | Evidência | Consequência |
| --- | --- | --- |
| Alta | `page.tsx` associava publicações a conteúdos por projeto e título. | Títulos iguais em Shorts, Reels e TikTok podiam abrir o checklist errado. A relação precisa usar `content_id`. |
| Alta | O carregamento chamava `syncAuroraPlanningBase`, marcando concepção como concluída a cada abertura. | Desmarcar manualmente uma etapa era revertido ao recarregar. Leituras não devem alterar os registros. |
| Alta | `ensureSeptember2026Plan` usava conflito de três colunas após 0003 trocar o índice por quatro colunas. | Novas contas podiam falhar ao criar o plano. |
| Alta | Chaves de importação não incluíam mês/ano; a reimportação forçava `in_progress`. | Planos de outros meses podiam colidir e publicações já agendadas ou publicadas perder seu status. |
| Alta | Políticas iniciais verificavam `user_id` da linha sem validar todas as referências a projetos, conteúdos e lotes. | Um cliente autenticado com IDs alheios poderia criar vínculos entre contas. A migração 0004 restringe essas referências. |
| Alta | A tela Hoje fixava dia 4; mês, quatro empresas e totais de dez entregas eram constantes. | A ferramenta não representava a data atual nem servia a novos produtos ou usuários. |
| Média | Importação e atualização de lote usavam várias chamadas de gravação. | Uma interrupção podia deixar uma operação parcialmente concluída. Recuperação idempotente ajuda, mas não equivale a transação no banco. |
| Média | Parser aceitava nomes de projetos previamente enumerados e uma única estrutura de Markdown. | O fluxo dependia de adaptações no código. Não havia interpretação universal ou IA conectada. |
| Média | Banco de conteúdo era uma tela explicativa; conta não oferecia saída ou recuperação de senha. | Uso cotidiano e recuperação de acesso incompletos. |

## Isolamento entre contas

As migrações 0001–0003 habilitam RLS e filtram dados pela identidade do Supabase Auth. A migração `0004_tenant_integrity.sql` adiciona políticas restritivas que exigem propriedade do projeto, vínculo de conteúdo no mesmo projeto e correspondência do lote com as etapas. Mantém nomes, tabelas e registros existentes; não requer alterações no cliente para funcionar.

A função auxiliar `jp_owns_content_in_project` usa `security definer` somente para uma consulta booleana com `auth.uid()` explícito e `search_path` vazio. Isso evita recursão na política de conteúdo que referencia conteúdo pai. Execução não é concedida ao papel anônimo. A função nunca retorna linhas ou identifica proprietários de outras contas.

A migração não corrige silenciosamente vínculos antigos inválidos. Esses registros devem ser investigados por um administrador. Também não transforma uma sequência de chamadas do navegador em uma transação e não substitui um teste de isolamento com duas contas.

## Verificação do ambiente

- Repositório vinculado ao projeto Vercel `jp`; CLI Vercel disponível.
- Supabase CLI e `psql` não encontrados no PATH. Não havia configuração local de projeto Supabase vinculado nem variáveis de ambiente de administração identificadas.
- Inspeção da equipe principal na Vercel encontrou somente URL e chave pública do Supabase. Elas permitem o uso do aplicativo com sessão autenticada, mas não a execução de migrações SQL.
- A equipe principal tentou o editor SQL no navegador; ele redirecionou para autenticação. Não há sessão administrativa utilizável para aplicar 0004 nesta execução.
- Nenhuma credencial privilegiada foi incluída no código, logs ou neste relatório. Não é correto afirmar que a 0004 foi aplicada ou que a segurança multiusuário foi testada no banco remoto.

## Critérios para liberar

- [x] Build e verificação de tipos passam na versão final.
- [x] Parser testado com os arquivos reais: Aurora 30 longos; Casa 95 entregas incluindo 5 longos. Prévia visual ainda não verificada.
- [x] Reimportar arquivo existente preserva etapas manuais e status de publicação (teste com cliente simulado).
- [ ] Um novo projeto de nome livre funciona sem edição de código e sem os projetos da conta original.
- [x] Mudança de mês e conteúdos de títulos iguais preservam a ligação por IDs (testes automatizados).
- [ ] Atualizar uma etapa, recarregar e reabrir outra sessão da mesma conta mantém o resultado.
- [x] Reaproveitar um ativo mantém o trabalho de produção compartilhado e a situação de cada publicação separada (teste com cliente simulado).
- [ ] Aplicar 0004 com conexão administrativa autorizada; verificar políticas instaladas.
- [ ] Testar duas contas reais: A não lê, edita nem associa projeto, conteúdo, etapa ou lote de B; vínculos válidos da própria conta continuam funcionando.
- [ ] Verificar recuperação de senha, confirmação de e-mail e URLs de retorno no projeto Supabase publicado.

## Limites que devem permanecer explícitos

A validação visual foi tentada em ambiente local isolado. O controle automático rejeitou a abertura do navegador por limite de uso da sessão. Não houve teste visual end-to-end, nem gravações de teste na conta real. A migração 0004 permanece preparada e não aplicada remotamente.

Importação baseada em parser não equivale a um modelo de IA capaz de entender qualquer arquivo. Formatos e campos aceitos devem aparecer na interface, com prévia e mensagens de validação. Agendar ou publicar dentro desta ferramenta registra o acompanhamento; postagem automática nas redes só existe depois de integrar suas APIs. Os arquivos de mídia permanecem externos quando a plataforma armazena apenas links ou evidências.
