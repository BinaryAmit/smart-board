# Smart Board (Next.js + Django)

This project converts your PDF whiteboard into a full-stack app with:

- Next.js frontend
- Django REST backend
- JWT authentication
- Multi-user shared boards (owner + collaborators)
- Shared page drawings per board/page
- Real-time board updates over WebSocket (Channels)
- Private local PDF upload into board pages

## Structure

- `frontend/` - Next.js 15 app router UI
- `backend/` - Django + DRF API

## Backend Setup (Django)

1. Open terminal in `backend/`
2. Create and activate virtual environment
3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Configure env (optional): copy values from `.env.example`
5. Run migrations:

```bash
python manage.py migrate
```

6. Start server:

```bash
python manage.py runserver
```

Backend base URL: `http://127.0.0.1:8000/api`

### Auth Endpoints

- `POST /api/auth/register/`
- `POST /api/auth/login/`
- `POST /api/auth/refresh/`
- `GET /api/auth/me/`

### Board Endpoints

- `GET/POST /api/boards/`
- `GET/PATCH/DELETE /api/boards/{id}/`
- `POST /api/boards/{id}/invite/`
- `GET/POST /api/boards/{board_id}/pages/`
- `PATCH /api/pages/{page_id}/drawing/`

## Frontend Setup (Next.js)

1. Open terminal in `frontend/`
2. Install dependencies:

```bash
npm install
```

3. Create `.env.local` using `.env.local.example`
4. Run dev server:

```bash
npm run dev
```

Frontend URL: `http://localhost:3000`

## Multi-User Notes

- Board owner can invite users by email.
- If invited email matches an existing account, collaborator access is granted.
- Collaborators with `editor` role can draw and save.
- `viewer` role is read-only.
- Live updates are pushed to connected users via `/ws/boards/{id}/`.

## PDF Notes

- In board view, use `PDF` button to add PDF pages from a public URL.
- Use `⭱` button to upload a local PDF file directly to backend storage.
- PDF pages become part of the shared board and can be annotated.

## Next Improvements (optional)

- Add page delete/reorder endpoints

## Production Notes

- Current channel layer is in-memory (good for local dev only).
- For production realtime sync, switch to Redis channel layer.
