# Remb

Remb is a Next.js app for managing project context, with GitHub OAuth support for importing repositories into the dashboard.

## Local setup

### 1. Configure GitHub OAuth

Create a GitHub OAuth App with these localhost settings:

- **Homepage URL**: `http://localhost:3000`
- **Authorization callback URL**: `http://localhost:3000/api/auth/github/callback`

Then copy [.env.example](.env.example) to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Required variables:

```env
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For scanning, also set:

```env
OPENAI_API_KEY=your_openai_key
```

Optional: free local embeddings for testing (via Ollama)

```env
EMBEDDING_PROVIDER=local
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

Then run Ollama locally:

```bash
ollama pull nomic-embed-text
ollama serve
```

Note: feature extraction still uses OpenAI (`gpt-4o-mini`) in the current implementation.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## GitHub OAuth flow

- The authorize redirect is handled in [app/api/auth/github/route.ts](app/api/auth/github/route.ts).
- The callback exchange is handled in [app/api/auth/github/callback/route.ts](app/api/auth/github/callback/route.ts).
- GitHub API helpers live in [lib/github.ts](lib/github.ts).

The current OAuth request asks GitHub for `read:user` and `repo` access so the app can read the connected user's profile and repositories.
