// src/web/auth.ts
import jwt from "jsonwebtoken";
import { config } from "../utils/config";
import { Request, Response, NextFunction } from "express";

const JWT_EXPIRY = "7d";

export function generateToken(): string {
  return jwt.sign({ role: "admin" }, config.web.jwtSecret, {
    expiresIn: JWT_EXPIRY,
  });
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, config.web.jwtSecret);
    return true;
  } catch {
    return false;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for login route
  if (req.path === "/auth/login" || req.path === "/api/auth/login") {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token não fornecido" });
    return;
  }

  const token = authHeader.slice(7);
  if (!verifyToken(token)) {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return;
  }

  next();
}
