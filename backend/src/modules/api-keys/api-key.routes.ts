import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { requireAuth, type AuthRequest } from '../../middleware/auth.middleware.js'
import { hashToken, randomToken } from '../../utils/crypto.js'

export const apiKeyRouter = Router()
apiKeyRouter.use(requireAuth)

const createSchema = z.object({ name: z.string().min(1).max(191) })

apiKeyRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.user!.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    })
    return res.json({ keys })
  } catch (error) {
    return next(error)
  }
})

apiKeyRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const body = createSchema.parse(req.body)
    const rawKey = `9d_${randomToken(32)}`
    const keyPrefix = rawKey.slice(0, 12)

    const apiKey = await prisma.apiKey.create({
      data: { userId: req.user!.id, name: body.name, keyPrefix, keyHash: hashToken(rawKey) },
    })

    return res.status(201).json({ key: { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.keyPrefix, rawKey, createdAt: apiKey.createdAt } })
  } catch (error) {
    return next(error)
  }
})

apiKeyRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id)
    await prisma.apiKey.updateMany({ where: { id, userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } })
    return res.json({ status: 'ok' })
  } catch (error) {
    return next(error)
  }
})
