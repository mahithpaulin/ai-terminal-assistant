import type { Request } from "express";

declare module "express-session" {
  interface SessionData {
    openaiApiKey?: string;
  }
}

export function getApiKey(req: Request): string | undefined {
  return req.session?.openaiApiKey;
}

export function setApiKey(req: Request, apiKey: string): void {
  req.session.openaiApiKey = apiKey;
}

export function hasApiKey(req: Request): boolean {
  return !!req.session?.openaiApiKey;
}
