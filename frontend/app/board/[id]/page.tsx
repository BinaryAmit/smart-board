"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useRequireAuth } from "@/components/auth-guard";
import SmartBoard from "@/components/smart-board";

export default function BoardPage() {
  const params = useParams<{ id: string }>();
  const user = useRequireAuth();

  if (!user) {
    return <main className="auth-shell">Checking your session...</main>;
  }

  return (
    <>
      <Link
        href="/boards"
        style={{
          position: "fixed",
          zIndex: 80,
          top: 10,
          left: 10,
          background: "#f2aa4c",
          color: "#121212",
          fontWeight: 700,
          padding: "6px 10px",
          borderRadius: 8,
        }}
      >
        Boards
      </Link>
      <SmartBoard boardId={params.id} user={user} />
    </>
  );
}
