import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'

function encryptionKey(env = process.env) {
  const secret = String(env.TOKEN_ENCRYPTION_KEY || '')
  if (!secret) return null
  return createHash('sha256').update(secret).digest()
}

export function hasTokenEncryptionKey(env = process.env) {
  return Boolean(encryptionKey(env))
}

export function isEncryptedSecret(value) {
  return String(value || '').startsWith(PREFIX)
}

export function encryptSecret(value, env = process.env) {
  if (value === null || value === undefined || value === '') return value
  if (isEncryptedSecret(value)) return value
  const key = encryptionKey(env)
  if (!key) {
    if (env.NODE_ENV === 'production') throw new Error('TOKEN_ENCRYPTION_KEY is required to store connected-account credentials.')
    return value
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`
}

export function decryptSecret(value, env = process.env) {
  if (!isEncryptedSecret(value)) return value
  const key = encryptionKey(env)
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required to read connected-account credentials.')
  const [ivPart, tagPart, ciphertextPart] = String(value).slice(PREFIX.length).split(':')
  if (!ivPart || !tagPart || !ciphertextPart) throw new Error('Connected-account credential is malformed.')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, 'base64url')), decipher.final()]).toString('utf8')
}
