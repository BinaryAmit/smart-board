import Link from "next/link";

export default function HomePage() {
  return (
    <main className="auth-shell">
      <section className="card">
        <h1>PDF Smart Board</h1>
        <p>Multi-user whiteboard with PDF support powered by Next.js + Django.</p>
        <div className="form">
          <Link href="/login">
            <button type="button">Login</button>
          </Link>
          <Link href="/register">
            <button type="button">Create Account</button>
          </Link>
        </div>
      </section>
    </main>
  );
}
