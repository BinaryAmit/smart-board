"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { register } from "@/lib/api";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      await register(username, email, password);
      router.push("/login");
    } catch {
      setError("Registration failed. Try a different username or email.");
    }
  }

  return (
    <main className="auth-shell">
      <section className="card">
        <h1>Create Account</h1>
        <p>Start using shared PDF whiteboards with your team.</p>
        <form className="form" onSubmit={onSubmit}>
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          <button type="submit">Register</button>
        </form>
        <p>
          Already have an account? <Link href="/login">Login</Link>
        </p>
      </section>
    </main>
  );
}
