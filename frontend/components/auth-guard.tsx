"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { me } from "@/lib/api";
import { readTokens } from "@/lib/auth-storage";
import { User } from "@/lib/types";

export function useRequireAuth(): User | null {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const tokens = readTokens();
    if (!tokens) {
      router.replace("/login");
      return;
    }

    me()
      .then(setUser)
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  return user;
}
