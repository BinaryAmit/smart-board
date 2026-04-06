import { clearTokens, readTokens, saveTokens } from "./auth-storage";
import { Board, BoardDetail, Page, User } from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api";

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
};

function getAuthHeaders(skipAuth?: boolean): Headers {
  const headers = new Headers();
  const tokens = readTokens();
  if (!skipAuth && tokens?.access) {
    headers.set("Authorization", `Bearer ${tokens.access}`);
  }
  return headers;
}

async function refreshToken(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens?.refresh) return null;

  const response = await fetch(`${API_BASE_URL}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: tokens.refresh }),
  });

  if (!response.ok) {
    clearTokens();
    return null;
  }

  const data = (await response.json()) as { access: string };
  saveTokens({ access: data.access, refresh: tokens.refresh });
  return data.access;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const authHeaders = getAuthHeaders(options.skipAuth);
  authHeaders.forEach((value, key) => headers.set(key, value));

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && !options.skipAuth) {
    const nextAccess = await refreshToken();
    if (!nextAccess) throw new Error("Session expired. Please login again.");

    headers.set("Authorization", `Bearer ${nextAccess}`);
    const retry = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
    if (!retry.ok) throw new Error(await retry.text());
    return retry.json() as Promise<T>;
  }

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function login(username: string, password: string) {
  const data = await request<{ access: string; refresh: string }>(
    "/auth/login/",
    {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ username, password }),
    },
  );
  saveTokens(data);
}

export async function register(
  username: string,
  email: string,
  password: string,
) {
  return request<{ id: number; username: string; email: string }>(
    "/auth/register/",
    {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ username, email, password }),
    },
  );
}

export async function me() {
  return request<User>("/auth/me/");
}

export async function getBoards() {
  return request<Board[]>("/boards/");
}

export async function createBoard(title: string) {
  return request<Board>("/boards/", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function getBoard(id: string) {
  return request<BoardDetail>(`/boards/${id}/`);
}

export async function inviteToBoard(
  id: string,
  email: string,
  role: "editor" | "viewer",
) {
  return request(`/boards/${id}/invite/`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export async function addPage(
  boardId: number,
  payload: {
    order: number;
    page_type: "blank" | "pdf";
    pdf_page_number?: number | null;
    pdf_source_url?: string;
    drawing_data?: unknown;
  },
) {
  return request<Page>(`/boards/${boardId}/pages/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePageDrawing(pageId: number, drawing_data: unknown) {
  return request<Page>(`/pages/${pageId}/drawing/`, {
    method: "PATCH",
    body: JSON.stringify({ drawing_data }),
  });
}

export async function uploadBoardPdf(boardId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  let headers = getAuthHeaders(false);
  let response = await fetch(`${API_BASE_URL}/boards/${boardId}/upload-pdf/`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (response.status === 401) {
    const nextAccess = await refreshToken();
    if (!nextAccess) throw new Error("Session expired. Please login again.");

    headers = getAuthHeaders(false);
    response = await fetch(`${API_BASE_URL}/boards/${boardId}/upload-pdf/`, {
      method: "POST",
      headers,
      body: formData,
    });
  }

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<Page[]>;
}

export function logout() {
  clearTokens();
}
