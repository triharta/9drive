import { Readable } from 'stream'
import { Router } from 'express'
import { google } from 'googleapis'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { requireAuth, type AuthRequest } from '../../middleware/auth.middleware.js'
import { ensureGoogleAppFolder, getAuthedGoogleClient, syncGoogleQuota } from '../google/google.service.js'

export const downloadRouter = Router()
downloadRouter.use(requireAuth)

type DownloadStatus = 'pending' | 'fetching' | 'downloading' | 'uploading' | 'completed' | 'failed'
type DownloadProgressEntry = {
  sessionId: string
  userId: string
  fileName: string
  status: DownloadStatus
  bytesDownloaded: bigint
  bytesTotal: bigint
  fileId?: string
  error?: string
}

const downloads = new Map<string, DownloadProgressEntry>()

function setProgress(sessionId: string, update: Partial<DownloadProgressEntry>) {
  const entry = downloads.get(sessionId)
  if (entry) Object.assign(entry, update)
}

function logDownload(message: string, metadata?: Record<string, unknown>) {
  console.info('[download]', message, metadata ?? '')
}

async function selectAccount(userId: string, sizeBytes: bigint, reservedBytesByAccount = new Map<string, bigint>()) {
  const accounts = await prisma.connectedAccount.findMany({
    where: { userId, provider: 'google_drive', status: 'connected' },
    include: { storageAccount: true },
  })
  const stale = accounts.filter((account) => !account.storageAccount?.lastSyncedAt || account.storageAccount.lastSyncedAt.getTime() < Date.now() - 5 * 60_000)
  for (const account of stale) await syncGoogleQuota(account.id)
  const fresh = await prisma.connectedAccount.findMany({
    where: { userId, provider: 'google_drive', status: 'connected' },
    include: { storageAccount: true },
  })
  return fresh
    .map((account) => ({ account, availableBytes: (account.storageAccount?.availableBytes ?? 0n) - (reservedBytesByAccount.get(account.id) ?? 0n) }))
    .filter(({ availableBytes }) => availableBytes >= sizeBytes)
    .sort((a, b) => Number(b.availableBytes - a.availableBytes))[0]?.account
}

function extractFileName(url: string, contentType: string, contentDisposition: string | null): string {
  if (contentDisposition) {
    const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?([^;\s"]+)/i)
    if (match) return decodeURIComponent(match[1].replace(/^"(.*)"$/, '$1'))
  }
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname
    const segments = pathname.split('/')
    const last = segments[segments.length - 1]
    if (last && last.length > 0) return decodeURIComponent(last)
  } catch {}
  const ext = contentType.split('/')[1]?.split(';')[0] ?? 'bin'
  return `download.${ext}`
}

async function runDownload(sessionId: string, userId: string, url: string, folderId: string | null, userFileName: string | undefined) {
  try {
    setProgress(sessionId, { status: 'fetching' })
    logDownload('fetching url', { sessionId, url: url.slice(0, 80) })

    const response = await fetch(url, {
      headers: { 'User-Agent': '9Drive/1.0' },
      redirect: 'follow',
    })
    if (!response.ok) {
      const msg = `Failed to fetch URL: ${response.status} ${response.statusText}`
      setProgress(sessionId, { status: 'failed', error: msg })
      await prisma.uploadSession.update({ where: { id: sessionId }, data: { status: 'failed', errorMessage: msg } }).catch(() => undefined)
      return
    }

    const contentLength = response.headers.get('content-length')
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const contentDisposition = response.headers.get('content-disposition')
    const fileName = userFileName || extractFileName(url, contentType, contentDisposition)
    const bytesTotal = contentLength ? BigInt(contentLength) : 0n
    const knownSize = bytesTotal > 0n

    logDownload('response received', { sessionId, fileName, sizeBytes: knownSize ? bytesTotal.toString() : 'unknown' })

    if (knownSize && bytesTotal > BigInt(env.MAX_UPLOAD_BYTES)) {
      const msg = 'File exceeds max upload size.'
      setProgress(sessionId, { status: 'failed', error: msg })
      await prisma.uploadSession.update({ where: { id: sessionId }, data: { status: 'failed', errorMessage: msg } }).catch(() => undefined)
      return
    }

    const account = await selectAccount(userId, knownSize ? bytesTotal : 0n)
    if (!account) {
      const msg = 'No connected Google Drive account has enough space for this download.'
      setProgress(sessionId, { status: 'failed', error: msg })
      await prisma.uploadSession.update({ where: { id: sessionId }, data: { status: 'failed', errorMessage: msg } }).catch(() => undefined)
      return
    }

    if (folderId) {
      await prisma.folder.findFirstOrThrow({ where: { id: folderId, userId, deletedAt: null } })
    }

    const sessionSize = knownSize ? bytesTotal : 0n
    await prisma.uploadSession.update({
      where: { id: sessionId },
      data: { targetConnectedAccountId: account.id, fileName, mimeType: contentType, sizeBytes: sessionSize },
    })

    const auth = await getAuthedGoogleClient(account)
    const drive = google.drive({ version: 'v3', auth })
    const appFolderId = await ensureGoogleAppFolder(account)

    const webStream = response.body
    if (!webStream) {
      const msg = 'No response body from URL.'
      setProgress(sessionId, { status: 'failed', error: msg })
      await prisma.uploadSession.update({ where: { id: sessionId }, data: { status: 'failed', errorMessage: msg } }).catch(() => undefined)
      return
    }

    const rawNodeStream = Readable.fromWeb(webStream as any)
    let streamedBytes = 0n

    setProgress(sessionId, { status: 'downloading', bytesTotal: knownSize ? bytesTotal : 0n })
    rawNodeStream.on('data', (chunk: Buffer) => {
      streamedBytes += BigInt(chunk.length)
      setProgress(sessionId, { bytesDownloaded: streamedBytes })
    })

    logDownload('uploading to google drive', { sessionId, accountId: account.id })
    setProgress(sessionId, { status: 'uploading' })

    const uploaded = await new Promise<any>((resolve, reject) => {
      rawNodeStream.on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))))
      drive.files.create({
        requestBody: { name: fileName, parents: [appFolderId] },
        media: { mimeType: contentType, body: rawNodeStream },
        fields: 'id,name,mimeType,size',
      }).then(resolve, reject)
    })

    logDownload('google upload completed', { sessionId, fileId: uploaded.data.id })

    if (knownSize && streamedBytes !== bytesTotal) {
      const msg = 'Downloaded byte count did not match expected content-length.'
      setProgress(sessionId, { status: 'failed', error: msg })
      await prisma.uploadSession.update({ where: { id: sessionId }, data: { status: 'failed', errorMessage: msg } }).catch(() => undefined)
      return
    }

    const fileSize = knownSize ? bytesTotal : streamedBytes
    const file = await prisma.file.create({
      data: {
        userId,
        connectedAccountId: account.id,
        folderId,
        provider: 'google_drive',
        providerFileId: uploaded.data.id ?? '',
        name: uploaded.data.name ?? fileName,
        mimeType: uploaded.data.mimeType ?? contentType,
        sizeBytes: fileSize,
      },
    })

    logDownload('database file created', { sessionId, fileId: file.id })

    await prisma.uploadSession.update({
      where: { id: sessionId },
      data: { status: 'completed', completedAt: new Date(), sizeBytes: fileSize },
    })

    syncGoogleQuota(account.id).catch(() => undefined)

    setProgress(sessionId, { status: 'completed', fileId: file.id })
    logDownload('download complete', { sessionId, fileId: file.id })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    logDownload('download failed', { sessionId, message: msg })
    setProgress(sessionId, { status: 'failed', error: msg })
    await prisma.uploadSession.update({ where: { id: sessionId }, data: { status: 'failed', errorMessage: msg } }).catch(() => undefined)
  }
}

downloadRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      url: z.string().url(),
      folderId: z.string().optional(),
      fileName: z.string().optional(),
    }).parse(req.body)

    logDownload('request started', { userId: req.user!.id, url: body.url.slice(0, 80) })

    const session = await prisma.uploadSession.create({
      data: {
        userId: req.user!.id,
        fileName: body.fileName || 'pending...',
        mimeType: 'application/octet-stream',
        sizeBytes: 0n,
        status: 'pending',
      },
    })

    downloads.set(session.id, {
      sessionId: session.id,
      userId: req.user!.id,
      fileName: body.fileName || extractFileName(body.url, 'application/octet-stream', null),
      status: 'pending',
      bytesDownloaded: 0n,
      bytesTotal: 0n,
    })

    runDownload(session.id, req.user!.id, body.url, body.folderId || null, body.fileName)

    return res.status(202).json({ sessionId: session.id })
  } catch (error) {
    return next(error)
  }
})

downloadRouter.get('/:sessionId/progress', async (req: AuthRequest, res, next) => {
  try {
    const sessionId = String(req.params.sessionId)
    const entry = downloads.get(sessionId)

    if (!entry || entry.userId !== req.user!.id) {
      return res.status(404).json({ code: 'DOWNLOAD_SESSION_NOT_FOUND', message: 'Download session not found.' })
    }

    const percent = entry.bytesTotal > 0n ? Number((entry.bytesDownloaded * 100n) / entry.bytesTotal) : 0

    return res.json({
      sessionId: entry.sessionId,
      status: entry.status,
      fileName: entry.fileName,
      bytesDownloaded: entry.bytesDownloaded.toString(),
      bytesTotal: entry.bytesTotal.toString(),
      percent,
      fileId: entry.fileId,
      error: entry.error || null,
    })
  } catch (error) {
    return next(error)
  }
})
