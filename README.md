# JP Studio — operação editorial

Aplicação independente em Next.js, React e Supabase, publicada pela Vercel. Cada conta administra seus próprios projetos e produtos.

## Fluxo de uso

1. Crie uma conta e cadastre um projeto com suas redes.
2. Importe um plano no próprio aplicativo ou defina uma frequência mensal e preencha as entregas.
3. Revise projeto, mês, formatos, datas e evidências identificadas antes de importar.
4. Trabalhe na tela Hoje, com pendências atrasadas e próximas, organizadas por projeto e rede.
5. Marque checks, atualize lotes, registre materiais externos e acompanhe os próximos passos.
6. Reutilize conteúdos prontos no banco e registre o agendamento/publicação de cada rede separadamente.

## Importação

Aceita Markdown, TXT estruturado, CSV e JSON, com prévia editável. Reconhece seções por dia, tabelas e listas semanais de vídeos longos. Uma importação recebe um projeto e um mês; nomes de projetos e períodos são livres.

CSV de exemplo:

```csv
data;canal;formato;titulo;ideia;referencia;cta
2027-02-01;youtube;youtube_long;Minha reflexão;A ideia central;Autor e obra;Comente
2027-02-02;instagram;carousel;Uma ideia em cards;Pontos principais;;Salve
```

JSON de exemplo:

```json
{
  "project": "Minha marca",
  "month": "2027-02",
  "entries": [
    {
      "date": "2027-02-01",
      "platform": "youtube",
      "format": "youtube_long",
      "title": "Minha reflexão",
      "brief": "A ideia central",
      "evidence": { "script": "Texto do roteiro concluído" }
    }
  ]
}
```

Plataformas disponíveis: YouTube, Instagram, TikTok e Spotify. Formatos: youtube_long, short, carousel, image e spotify_episode. Redes não suportadas geram avisos; não são importadas silenciosamente.

O leitor é determinístico, sem provedor de IA conectado. Não interpreta documentos arbitrários ou PDFs. A evidência deve estar expressa no arquivo; texto de thumbnail não significa imagem pronta, e publicação não inventa conclusão das etapas anteriores. A reimportação preserva checks manuais; para concluir etapas já existentes use Atualizar etapas.

Há uma entrega de cada formato por rede/dia; Short e longo coexistem. Múltiplas entregas do mesmo formato/dia exigem evolução de identificação de slots. Derivados sem data própria permanecem como notas. O vínculo de reaproveitamento é explícito no banco.

## Dados e integridade

- Supabase Auth + políticas RLS por conta.
- Conteúdos e publicações relacionados por ID, nunca apenas por título.
- Paginação evita ocultar etapas além das primeiras 1.000 linhas.
- Importações usam IDs estáveis e verificação antecipada de conflitos.
- Repetir uma importação não apaga progresso nem agendamentos.
- Gravações usam chamadas separadas, não uma transação única. Falhas parciais são informadas e o mesmo arquivo pode retomar a importação.
- A leitura do painel não marca ou modifica etapas.
- Mídia fica nos serviços externos escolhidos pelo usuário; a plataforma guarda links e evidências.
- Exportar meus dados baixa um JSON de consulta/backup; restauração automática desse backup não está implementada.

## Configurar

```bash
npm ci
npm run dev
```

Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local e na Vercel. Execute as migrações 0001 a 0004 na ordem. Configure as URLs autorizadas de redirecionamento do Supabase Auth para seu domínio, inclusive recuperação de senha.

A migração 0004 reforça a propriedade das referências entre contas e projetos. Sua aplicação remota requer uma sessão administrativa; veja docs/AUDIT.md para o estado verificado da entrega. Não distribua chaves administrativas no navegador.

## Verificar

```bash
npm test
npm run lint
npm run build
```

Os testes do repositório usam um cliente Supabase simulado: importação idempotente, conflitos, isolamento nas operações do cliente, paginação e preservação de status. Os dois testes com os arquivos originais de conteúdo são executados quando esses documentos estão presentes no workspace; não são necessários em instalações de terceiros.

scripts/audit-fixture.mjs é um servidor HTTP de teste local em 127.0.0.1:54329, sem persistência e sem acesso a dados reais. Não é carregado nem publicado pelo aplicativo.

## Publicar

Conecte o GitHub à Vercel e configure as duas variáveis públicas. Postar ou agendar na interface registra a operação: o aplicativo não envia publicações às APIs das redes sociais. Não usa Sites.

