"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { login } from "@/lib/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      await login(username, password);
      router.push("/boards");
    } catch {
      setError("Login failed. Check username/password.");
    }
  }

  return (
    <main className="auth-shell">
      <section className="card">
        <h1>Welcome Back</h1>
        <p>Sign in to continue to your smart boards.</p>
        <form className="form" onSubmit={onSubmit}>
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          <button type="submit">Login</button>
        </form>
        <p>
          New user? <Link href="/register">Create account</Link>
        </p>
      </section>
    </main>
  );
}
