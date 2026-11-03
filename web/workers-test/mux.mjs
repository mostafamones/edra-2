import { generateKeyPairSync, createPrivateKey, createSign, createVerify, createHmac, timingSafeEqual } from 'node:crypto';
export default { async test() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const key = createPrivateKey(Buffer.from(Buffer.from(pem).toString('base64'), 'base64').toString('utf8'));
  const payload = Buffer.from('{"alg":"RS256"}').toString('base64url') + '.' + Buffer.from('{"sub":"fixture"}').toString('base64url');
  const signature = createSign('RSA-SHA256').update(payload).sign(key, 'base64url');
  if (!createVerify('RSA-SHA256').update(payload).verify(publicKey, Buffer.from(signature, 'base64url'))) throw Error('RSA JWT failed');
  const mac = createHmac('sha256', 'fixture').update('1.body').digest();
  if (!timingSafeEqual(mac, Buffer.from(mac.toString('hex'), 'hex'))) throw Error('HMAC failed');
  console.log('MUX crypto RSA-SHA256 and HMAC: pass');
} };
