import { Signer } from '@volcengine/openapi'

const AK = process.env.VOLC_AK
const SK = process.env.VOLC_SK

if (!AK || !SK) {
  console.error('Error: VOLC_AK and VOLC_SK environment variables are required')
  console.error('Please set them in your .env file or environment')
  process.exit(1)
}
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
