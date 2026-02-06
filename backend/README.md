# The Dump - Backend

Backend do sistema The Dump.

## Instalação
```bash
npm install
```

## Configuração

Criar arquivo `.env` com as variáveis necessárias.

### Variáveis de ambiente importantes

As seguintes variáveis são necessárias para habilitar o login via Google OAuth e o funcionamento do backend:

- `GOOGLE_CLIENT_ID` - ID do cliente OAuth do Google
- `GOOGLE_CLIENT_SECRET` - Secret do cliente OAuth do Google
- `GOOGLE_CALLBACK_URL` - URL de callback (ex: `https://your-domain.com/auth/google/callback`)
- `FRONTEND_URL` - URL do frontend para redirecionamento após login (ex: `https://the-dump-gamma.vercel.app`)
- `BASE_URL` - URL base do backend (opcional, usado para callback padrão quando não informado)
- `JWT_SECRET` - Segredo para assinar tokens JWT

Também mantenha as variáveis existentes para DB e Cloudinary:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
 
### Usando sua própria conta Google (OAuth)

1. Abra o Google Cloud Console com a sua conta Google: https://console.cloud.google.com/
2. Crie um projeto (ou selecione um existente) e ative a API "Google+" / OAuth consent.
3. Em "APIs & Services" → "Credentials" crie um OAuth 2.0 Client ID (Application type: Web application).
4. Em "Authorized redirect URIs" adicione:
	- `${BASE_URL}/auth/google/callback` (ex: `https://your-backend.example.com/auth/google/callback`)
5. Após criar, copie o `Client ID` e `Client secret` e adicione ao seu `.env` como:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=https://your-backend.example.com/auth/google/callback
```

6. Configure também no `.env`:

```
FRONTEND_URL=https://your-frontend.example.com
BASE_URL=https://your-backend.example.com
ALLOWED_ORIGINS=https://your-frontend.example.com
JWT_SECRET=a-strong-random-secret
```

7. Reinicie o backend e abra: `https://your-backend.example.com/auth/google` para iniciar o fluxo.

Observação: this service creates a local user record for the Google account (password is randomized) so the rest of the app uses the same `users` table.

## Executar
```bash
npm start
```