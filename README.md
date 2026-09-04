# JP Studio

Torre de controle editorial para as operações de conteúdo da JP Studio.

## Produto inicial

- Dashboard **Hoje** para priorizar `POSTAR HOJE`, agendamentos e produção em risco.
- Calendário editorial e pipeline por estado.
- Banco de conteúdo para reaproveitar shorts, imagens e temas nos canais compatíveis.
- Projetos ativos: Aurora, Casa de Afeto, Conhecimento Acessível e Pense IA.
- Projetos em incubação: Pookies e Climatização Inteligente.

## Modelo operacional

O sistema separa o que é produzido do que é publicado: um vídeo curto pode virar uma publicação no YouTube Shorts, um Reel e um TikTok, sem duplicar o trabalho de produção. Roteiros, arquivos e edições permanecem nos seus lugares de criação; a plataforma guarda o status e os links de cada etapa.

## Arquitetura de evolução

O MVP usa dados locais para validar o fluxo. Para produção, conecte um projeto Supabase (Postgres, Auth e Storage) e substitua os dados demonstrativos por estas entidades: `Project`, `ContentIdea`, `ContentAsset`, `ProductionTask`, `Publication`, `ContentBankEntry` e `Reference`.

## Rodar localmente

```bash
npm install
npm run dev
```

Para publicar, conecte este repositório ao Vercel. Não há dependência de Sites/Cloudflare/OpenAI Hosting.
