# Mile Manager Pro

Sistema de gestão de milhas e pontos de fidelidade.

## Arquitetura

```
/backend     → API Express (porta 3000) - Supabase, lógica, dados
/frontend    → App React (exportável para Lovable) - UI/UX
/docs        → Documentação da API
```

## Desenvolvimento

### Modo padrão (Supabase direto)
O frontend usa Supabase diretamente (comportamento atual).

```bash
npm install
npm run dev
```

Acesse: http://localhost:3080

### Modo com backend separado
Para usar o backend API (ex: Lovable, produção):

1. Configure o backend:
```bash
cd backend
cp .env.example .env
# Edite .env com SUPABASE_URL e SUPABASE_ANON_KEY
npm install
npm run dev
```

2. Configure o frontend:
```bash
# Na raiz, crie .env com:
VITE_API_URL=http://localhost:3000
```

3. Rode ambos:
```bash
npm run dev:all
```

- Backend: http://localhost:3000
- Frontend: http://localhost:3080

## Exportar para Lovable

A pasta `/frontend` contém o app React completo e pode ser exportada para o Lovable. Configure `VITE_API_URL` apontando para o backend em produção.

## Documentação da API

Ver [docs/api.md](docs/api.md).
