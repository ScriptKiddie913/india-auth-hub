// src/hooks/useAuth.ts
import { useEffect, useState } from "react";

type AuthToken = {
  email: string;
  badge: string;
};

export function useAuth() {
  const [auth, setAuth] = useState<AuthToken | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("police_auth");
    if (stored) setAuth(JSON.parse(stored));
  }, []);

  const login = (token: AuthToken) => {
    localStorage.setItem("police_auth", JSON.stringify(token));
    setAuth(token);
  };

  const logout = () => {
    localStorage.removeItem("police_auth");
    setAuth(null);
  };

  return { auth, login, logout };
}
