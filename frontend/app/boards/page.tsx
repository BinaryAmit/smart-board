"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { useRequireAuth } from "@/components/auth-guard";
import { createBoard, getBoards, inviteToBoard, logout } from "@/lib/api";
import { Board } from "@/lib/types";

export default function BoardsPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [newTitle, setNewTitle] = useState("My Board");
  const [inviteBoardId, setInviteBoardId] = useState<number | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getBoards().then(setBoards).catch(() => setError("Could not load boards"));
  }, [user]);

  async function onCreateBoard(e: FormEvent) {
    e.preventDefault();
    const board = await createBoard(newTitle);
    setBoards((prev) => [board, ...prev]);
    setNewTitle("My Board");
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteBoardId) return;

    await inviteToBoard(String(inviteBoardId), inviteEmail, inviteRole);
    setInviteBoardId(null);
    setInviteEmail("");
    setInviteRole("editor");
  }

  function signOut() {
    logout();
    router.push("/login");
  }

  return (
    <main className="auth-shell">
      <section className="card" style={{ width: "min(900px, 100%)" }}>
        <h1>Boards</h1>
        <p>{user ? `Logged in as ${user.username}` : "Checking session..."}</p>

        <form className="form" onSubmit={onCreateBoard}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
          <button type="submit">Create New Board</button>
        </form>

        {error && <div className="error">{error}</div>}

        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          {boards.map((board) => (
            <div
              key={board.id}
              style={{
                border: "1px solid rgba(169, 191, 211, 0.25)",
                borderRadius: 12,
                padding: 12,
                display: "flex",
                gap: 8,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{board.title}</div>
                <div style={{ color: "#a9bfd3", fontSize: 13 }}>
                  Owner: {board.owner?.username ?? "Unknown"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link href={`/board/${board.id}`}>
                  <button type="button">Open</button>
                </Link>
                <button type="button" onClick={() => setInviteBoardId(board.id)}>
                  Invite
                </button>
              </div>
            </div>
          ))}
        </div>

        {inviteBoardId && (
          <form className="form" onSubmit={onInvite} style={{ marginTop: 14 }}>
            <input
              type="email"
              placeholder="Invite user email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button type="submit">Send Invite</button>
          </form>
        )}

        <button type="button" onClick={signOut} style={{ marginTop: 16, background: "#d95f59", color: "white" }}>
          Logout
        </button>
      </section>
    </main>
  );
}
