# SMS Platform - Multi-Tenant Messaging System

Sistema de disparo de mensagens via Google Messages Web usando Playwright, com suporte a texto e imagem (RCS), multi-tenant.

## 🚀 Stack

- **Backend API**: Node.js + Fastify (TypeScript)
- **Automação**: Playwright (Chromium)
- **Banco de Dados**: PostgreSQL
- **Fila**: pg-boss
- **Frontend**: React + Vite + Tailwind
- **Infra**: Docker Compose + Nginx

## 📁 Estrutura do Projeto

```
sms/
├── apps/
│   ├── api/           # Backend Fastify
│   ├── worker/        # Worker Playwright
│   └── web/           # Frontend React
├── packages/
│   └── shared/        # Types e validators compartilhados
├── migrations/        # SQL migrations
├── docker/            # Dockerfiles
├── docker-compose.yml
├── nginx.conf
└── .env.example
```

## 🛠️ Setup Local

### Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- npm 9+

### 1. Clonar e Configurar

```bash
# Clonar o repositório
cd sms

# Copiar variáveis de ambiente
cp .env.example .env

# Editar .env conforme necessário (DB_PASSWORD, JWT_SECRET, etc.)
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Subir Infraestrutura com Docker

```bash
# Subir PostgreSQL e MinIO
docker-compose up -d postgres minio

# Aguardar inicialização
sleep 10
```

### 4. Rodar em Desenvolvimento

```bash
# Terminal 1 - API
npm run dev:api

# Terminal 2 - Worker (requer Playwright instalado)
cd apps/worker && npx playwright install chromium
npm run dev:worker

# Terminal 3 - Frontend
npm run dev:web
```

### 5. Acessar

- **Frontend**: http://localhost:5173
- **API**: http://localhost:3000
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

## 🐳 Deploy com Docker (VPS)

### 1. Configurar Variáveis

```bash
cp .env.example .env

# Editar com valores de produção:
# - DB_PASSWORD (senha forte)
# - JWT_SECRET (chave aleatória 64+ chars)
# - S3_ENDPOINT (endpoint S3 real ou MinIO)
```

### 2. Build e Deploy

```bash
# Build e iniciar todos os serviços
docker-compose up -d --build

# Ver logs
docker-compose logs -f
```

### 3. Configurar SSL (Produção)

1. Gerar certificados com Let's Encrypt
2. Copiar para `./certs/`
3. Descomentar bloco HTTPS em `nginx.conf`
4. Reiniciar nginx

## 📱 Como Conectar Google Messages

1. Acesse o dashboard (http://localhost)
2. Faça login ou crie uma conta
3. Vá em **Sessão** no menu lateral
4. Clique em **Conectar**
5. No celular Android:
   - Abra Google Messages
   - Menu (⋮) → **Pareamento de dispositivos**
   - Escaneie o QR Code exibido

## 📤 Teste de Envio

### 1. Texto Simples

1. Vá em **Contatos** e adicione um número (formato +5511999999999)
2. Vá em **Campanhas** → **Nova Campanha**
3. Escolha tipo **Texto**
4. Escreva a mensagem
5. Salve e clique em **Iniciar**

### 2. Imagem (RCS)

1. Vá em **Mídias** e faça upload de uma imagem
2. Vá em **Campanhas** → **Nova Campanha**
3. Escolha tipo **Imagem**
4. Selecione a imagem e escreva legenda (opcional)
5. Salve e clique em **Iniciar**

> ⚠️ **Nota**: Se o destinatário não suportar RCS, o sistema enviará automaticamente um fallback com texto + link da imagem.

## 🔧 Variáveis de Ambiente

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| DATABASE_URL | URL de conexão PostgreSQL | postgres://user:pass@host:5432/db |
| JWT_SECRET | Chave secreta para JWT | (64+ caracteres aleatórios) |
| S3_ENDPOINT | Endpoint S3 compatível | http://localhost:9000 |
| S3_ACCESS_KEY | Access key S3 | minioadmin |
| S3_SECRET_KEY | Secret key S3 | minioadmin |
| S3_BUCKET | Nome do bucket | sms-media |

## 📊 Endpoints Principais

### Autenticação
- `POST /auth/register` - Registro (cria tenant + owner)
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - Logout

### Sessão
- `GET /sessions` - Status da sessão
- `POST /sessions/connect` - Iniciar conexão (gera QR)
- `GET /sessions/qr/stream` - SSE para QR em tempo real

### Contatos
- `GET /contacts` - Listar
- `POST /contacts` - Criar
- `POST /contacts/import` - Importar CSV

### Mídias
- `GET /media` - Listar
- `POST /media/upload` - Upload
- `DELETE /media/:id` - Excluir

### Campanhas
- `GET /campaigns` - Listar
- `POST /campaigns` - Criar
- `POST /campaigns/:id/start` - Iniciar
- `POST /campaigns/:id/pause` - Pausar

### Mensagens
- `GET /messages` - Listar logs
- `GET /messages/stats` - Estatísticas

## 🔐 Roles (RBAC)

| Role | Permissões |
|------|------------|
| owner | Todas as operações |
| admin | Gerenciar usuários, contatos, campanhas, mídias |
| operator | Criar/iniciar campanhas, importar contatos |
| viewer | Somente leitura |

## ⚠️ Limitações e Cuidados

1. **Rate Limiting**: O sistema usa throttle de 3-8 segundos entre mensagens para evitar bloqueio
2. **Detecção de Automação**: Google pode bloquear sessões suspeitas
3. **RCS**: Nem todos os destinatários suportam - fallback automático para texto
4. **Sessão**: Manter o celular conectado à internet

## 📝 Licença

MIT
