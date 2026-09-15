import crypto from 'node:crypto';

export const ED25519_SIGNATURE_ALG = 'ed25519-v1';
export const LEGACY_HMAC_SIGNATURE_ALG = 'hmac-sha256-v1';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stable(value[key])])
  );
  return value;
}

export function decisionPayload(decision) {
  const { signature: _signature, ...unsigned } = decision;
  return Buffer.from(JSON.stringify(stable(unsigned)));
}

export class ReviewCrypto {
  constructor({ publicKey = null, privateKey = null, legacySecret = null, keyId = 'review-ed25519-v1' } = {}) {
    this.privateKey = privateKey || null;
    this.publicKey = publicKey || (privateKey ? crypto.createPublicKey(privateKey) : null);
    this.legacySecret = legacySecret || null;
    this.keyId = keyId;
  }

  canSign() {
    return Boolean(this.privateKey || (typeof this.legacySecret === 'string' && this.legacySecret.length >= 16));
  }

  canVerify(decision = null) {
    const alg = decision?.signature_alg ?? (decision?.signature ? LEGACY_HMAC_SIGNATURE_ALG : null);
    if (alg === ED25519_SIGNATURE_ALG) return Boolean(this.publicKey);
    if (alg === LEGACY_HMAC_SIGNATURE_ALG) return typeof this.legacySecret === 'string' && this.legacySecret.length >= 16;
    return false;
  }

  sign(decision) {
    if (this.privateKey) {
      const record = { ...decision, signature_alg: ED25519_SIGNATURE_ALG, key_id: this.keyId, signature: '' };
      record.signature = crypto.sign(null, decisionPayload(record), this.privateKey).toString('base64');
      return record;
    }
    if (typeof this.legacySecret === 'string' && this.legacySecret.length >= 16) {
      const record = { ...decision, signature_alg: LEGACY_HMAC_SIGNATURE_ALG, key_id: 'legacy-hmac', signature: '' };
      record.signature = crypto.createHmac('sha256', this.legacySecret).update(decisionPayload(record)).digest('hex');
      return record;
    }
    throw new Error('审阅签名能力不可用；Review Service 需要 Ed25519 私钥（推荐）或旧版 KB_REVIEW_SECRET');
  }

  verify(decision) {
    if (!decision || typeof decision !== 'object' || typeof decision.signature !== 'string') return false;
    const alg = decision.signature_alg ?? LEGACY_HMAC_SIGNATURE_ALG;
    try {
      if (alg === ED25519_SIGNATURE_ALG) {
        if (!this.publicKey) return false;
        return crypto.verify(null, decisionPayload(decision), this.publicKey, Buffer.from(decision.signature, 'base64'));
      }
      if (alg === LEGACY_HMAC_SIGNATURE_ALG) {
        if (typeof this.legacySecret !== 'string' || this.legacySecret.length < 16) return false;
        // v0.2 records had no signature_alg/key_id and signed the insertion-ordered payload.
        if (!decision.signature_alg) {
          const { signature: _ignored, ...payload } = decision;
          const expected = crypto.createHmac('sha256', this.legacySecret).update(JSON.stringify(payload)).digest('hex');
          return /^[a-f0-9]{64}$/.test(decision.signature)
            && crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(decision.signature, 'hex'));
        }
        const expected = crypto.createHmac('sha256', this.legacySecret).update(decisionPayload(decision)).digest('hex');
        return /^[a-f0-9]{64}$/.test(decision.signature)
          && crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(decision.signature, 'hex'));
      }
    } catch {
      return false;
    }
    return false;
  }
}
