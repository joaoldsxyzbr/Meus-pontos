# Agente Meus-pontos (Mistral Agents SDK)

Agente gerenciado no Mistral Studio para o sistema de controle de ponto
[Meus-pontos](../../README.md): registrar batidas (`ponto HHMM`), consultar jornada,
saldo do dia e banco de horas, e gerenciar justificativas e ajustes no banco Cloudflare
D1 `meus-pontos` (`150895af-1ec9-4c6c-af03-a43189a9bb71`) via conector
`plataforma_de_desenvolvedores_cloudflare_2967`.

## Rodar local

```sh
uv sync
uv run --env-file .env agents chat   # .env com MISTRAL_API_KEY
```

## Deploy gerenciado no Studio

```sh
git push origin <branch>
uv run --env-file .env agents deploy
```

O deploy constrói o commit enviado (branch com upstream), usando o `Dockerfile` deste
diretório. Nome do agente: `meus-pontos`.
