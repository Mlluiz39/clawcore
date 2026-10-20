// src/web/auth.ts
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../utils/config";
import { Request, Response, NextFunction } from "express";

// 7 dias de validade era uma janela longa demais. 12h cobre um dia de trabalho
// sem exigir login.
const JWT_EXPIRY = "12h";

/** Nome do cookie de sessão. HttpOnly: inacessível a JavaScript. */
export const AUTH_COOKIE = "clawcore_token";

export function generateToken(): string {
  return jwt.sign({ role: "admin" }, config.web.jwtSecret, {
    expiresIn: JWT_EXPIRY,
  });
}

/**
 * Compara a senha em tempo constante.
 *
 * `a !== b` sai no primeiro byte diferente, o que vaza o tamanho do prefixo
 * correto pelo tempo de resposta. `timingSafeEqual` exige buffers do mesmo
 * tamanho, então comparamos hashes (sempre 32 bytes) das duas entradas.
 */
export function verifyPassword(provided: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(provided, "utf8").digest();
  const b = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, config.web.jwtSecret);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opções do cookie de sessão.
 *
 * - `httpOnly`: JavaScript não lê — um XSS não consegue exfiltrar o token.
 * - `sameSite: "strict"`: o browser não envia o cookie em requisição
 *   cross-site, o que fecha CSRF sem precisar de token anti-CSRF.
 * - `secure`: só em HTTPS. Em dev local (http://localhost) precisa ficar
 *   desligado, senão o browser descarta o cookie.
 */
export function sessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: "strict";
  secure: boolean;
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000, // 12h, alinhado ao JWT
    path: "/",
  };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for login route
  if (req.path === "/auth/login" || req.path === "/api/auth/login") {
    next();
    return;
  }

  // Cookie tem precedência; o header continua aceito para clientes que não
  // usam browser (curl, testes) e para chamadas de API diretas.
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[AUTH_COOKIE];
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = cookieToken || headerToken;

  if (!token) {
    res.status(401).json({ error: "Token não fornecido" });
    return;
  }

  if (!verifyToken(token)) {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return;
  }

  next();
}
