import { Signer } from '@volcengine/openapi'

const AK = process.env.VOLC_AK || 'YOUR_ACCESS_KEY_HERE'
const SK = process.env.VOLC_SK || 'TmpVMVlUUXdaakprT0dObE5ESm1NV0psTURneVpEY3dZbUZsWkdWbU1UYw=='
const SERVICE = 'air'
const REGION = 'cn-north-1'
const HOST = 'api-knowledgebase.mlp.cn-beijing.volces.com'
const BASE_URL = 'http://' + HOST

export function buildSignedRequest(method, path, body) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)

  const requestObj = {
    region: REGION,
    method,
    pathname: path,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json',
      'Host': HOST
    },
    body: bodyStr
  }

  const signer = new Signer(requestObj, SERVICE)
  signer.addAuthorization({ accessKeyId: AK, secretKey: SK })

  const signedHeaders = requestObj.headers
  signedHeaders['Content-Type'] = 'application/json; charset=utf-8'
  const url = BASE_URL + path

  return { url, headers: signedHeaders, body: bodyStr }
}
