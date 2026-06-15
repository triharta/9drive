import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { verifyAccessToken } from '../utils/jwt.js'
import { hashToken } from '../utils/crypto.js'

export type AuthRequest = Request & {
  user?: { id: string; sessionId: string }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.header('Authorization')
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Bearer token required.' })
    const payload = verifyAccessToken(header.slice(7))
    const session = await prisma.userSession.findUnique({ where: { id: payload.sid } })
    if (!session || session.revokedAt || session.expiresAt < new Date()) return res.status(401).json({ code: 'AUTH_SESSION_EXPIRED', message: 'Session expired.' })
    req.user = { id: payload.sub, sessionId: payload.sid }
    return next()
  } catch {
    return res.status(401).json({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid token.' })
  }
}

export async function requireAuthOrApiKey(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const bearer = req.header('Authorization')
    if (bearer?.startsWith('Bearer ')) {
      const payload = verifyAccessToken(bearer.slice(7))
      const session = await prisma.userSession.findUnique({ where: { id: payload.sid } })
      if (!session || session.revokedAt || session.expiresAt < new Date()) return res.status(401).json({ code: 'AUTH_SESSION_EXPIRED', message: 'Session expired.' })
      req.user = { id: payload.sub, sessionId: payload.sid }
      return next()
    }

    const apiKey = req.header('X-API-Key')
    if (apiKey) {
      const keyHash = hashToken(apiKey)
      const key = await prisma.apiKey.findUnique({ where: { keyHash } })
      if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) {
        return res.status(401).json({ code: 'API_KEY_INVALID', message: 'API key is invalid or expired.' })
      }
      await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      req.user = { id: key.userId, sessionId: `api:${key.id}` }
      return next()
    }

    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Bearer token or X-API-Key header required.' })
  } catch {
    return res.status(401).json({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid authentication.' })
  }
}
