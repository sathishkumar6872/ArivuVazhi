"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearSession, saveSession, type User } from "./api";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { firstName: string; lastName: string; email: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    if (!localStorage.getItem("av_access")) {
      setUser(null);
      return null;
    }
    const me = await api<User>("/me");
    setUser(me);
    return me;
  }

  useEffect(() => {
    refreshUser().catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await api<{ user: User; accessToken: string; refreshToken: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    saveSession(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user;
  }

  async function register(input: { firstName: string; lastName: string; email: string; password: string }) {
    const data = await api<{ user: User; accessToken: string; refreshToken: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    saveSession(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    const refreshToken = localStorage.getItem("av_refresh");
    if (refreshToken) {
      await api("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
    }
    clearSession();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}

export function useRequireStudent() {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) router.replace("/login");
    else if (auth.user.role !== "student") router.replace("/login");
    else if (!auth.user.onboardingComplete) router.replace("/onboarding");
  }, [auth.loading, auth.user, router]);
  return auth;
}
