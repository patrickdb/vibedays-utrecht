# REST API

`/api/todos` is the adapter for non-browser clients (the CLI). It follows the rules in [architecture.md](architecture.md): parse with a contract schema, `getUserId`, call the service, map errors. The routes are `app/api/todos/route.ts` and `app/api/todos/[id]/route.ts`; the shared plumbing is `lib/rest.ts`.

## Endpoints

Schemas are from `@todo-cat/contract`. Every error body is `errorBodySchema`; every endpoint can answer 401 `unauthorized`.

- `GET /api/todos?status=open|done|all&q=text`: query `todoFilterSchema`, returns `todoSchema[]`; 200, 400.
- `POST /api/todos`: body `addTodoInputSchema`, returns `todoSchema`; 201, 400.
- `GET /api/todos/:id`: returns `todoSchema`; 200, 404.
- `PATCH /api/todos/:id`: body `updateTodoInputSchema`, returns `todoSchema`; 200, 400, 404.
- `DELETE /api/todos/:id`: no body; 204, 404.

## Getting a bearer token

The token is the `set-auth-token` response header of an email sign-in (the Better Auth `bearer` plugin, see [auth.md](auth.md)):

```sh
TOKEN=$(curl -si http://localhost:3000/api/auth/sign-in/email \
  -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
  -d '{"email":"demo@todo-cat.dev","password":"cat-person-2026"}' \
  | grep -i '^set-auth-token:' | cut -d' ' -f2 | tr -d '\r')
curl http://localhost:3000/api/todos -H "authorization: Bearer $TOKEN"
```

## Gotchas

- A session cookie works too, since both go through `getUserId`.
- Unknown ids and other users' ids both give 404; a malformed JSON body gives 400 `validation-failed`.
- Tests: `tests/unit/rest-api.test.ts` calls the handlers directly on a temp database with real bearer tokens.
