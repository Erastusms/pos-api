import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { env } from '../../config/env'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadedFile {
  fieldname: string
  filename: string
  mimetype: string
  data: Buffer
}

export interface StoredFile {
  url: string        // public URL / relative path
  filename: string   // stored filename
  size: number       // bytes
  mimetype: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

const UPLOAD_DIR = path.resolve('uploads')
const MAX_FILE_SIZE = 5 * 1024 * 1024  // 5 MB
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp']

// Ensure upload directory exists on startup
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateFilename(originalName: string, mimetype: string): string {
  const ext = mimetype === 'image/jpeg' ? 'jpg'
    : mimetype === 'image/png'  ? 'png'
    : 'webp'
  const hash = crypto.randomBytes(16).toString('hex')
  return `${Date.now()}-${hash}.${ext}`
}

function getPublicUrl(filename: string): string {
  // In production, this would return a CDN/S3 URL
  // In development, return a local server URL
  const baseUrl = env.NODE_ENV === 'production'
    ? process.env['STORAGE_BASE_URL'] ?? ''
    : `http://localhost:${env.PORT}`
  return `${baseUrl}/uploads/${filename}`
}

// ─── Storage service ─────────────────────────────────────────────────────────

export const storageService = {
  /**
   * Save an uploaded file to disk (local) or S3 (production).
   * Returns the public URL and metadata.
   */
  async save(file: UploadedFile): Promise<StoredFile> {
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new Error(`Tipe file tidak didukung: ${file.mimetype}. Gunakan JPEG, PNG, atau WebP.`)
    }

    if (file.data.length > MAX_FILE_SIZE) {
      throw new Error(`Ukuran file terlalu besar. Maksimal ${MAX_FILE_SIZE / 1024 / 1024}MB.`)
    }

    const filename = generateFilename(file.filename, file.mimetype)
    const filepath = path.join(UPLOAD_DIR, filename)

    await fs.promises.writeFile(filepath, file.data)

    return {
      url: getPublicUrl(filename),
      filename,
      size: file.data.length,
      mimetype: file.mimetype,
    }
  },

  /**
   * Delete a file from storage by its URL or filename.
   */
  async delete(urlOrFilename: string): Promise<void> {
    // Extract filename from URL if full URL is given
    const filename = urlOrFilename.includes('/')
      ? urlOrFilename.split('/').pop() ?? urlOrFilename
      : urlOrFilename

    const filepath = path.join(UPLOAD_DIR, filename)
    try {
      await fs.promises.unlink(filepath)
    } catch {
      // File might not exist — not a critical error
    }
  },
}
