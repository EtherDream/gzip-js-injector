import http from 'node:http'
import https from 'node:https'
import { pipeline } from 'node:stream'
import binding from 'bindings'
import { QuickReader, A } from 'quickreader'
import { genGzipInject } from './gen.js'


const {Crc32Combine} = binding('addon')

const INJECT_HTML = Buffer.from(
  '<!doctype html><script>console.warn("Hi Jack")</script>\n'
)
const [injectGzipBuf, injectGzipCrc] = await genGzipInject(INJECT_HTML)

const TRAILER_BUF = Buffer.alloc(8)
const TRAILER_U32 = new Uint32Array(TRAILER_BUF.buffer)

/**
 * @param {AsyncIterable<Buffer>} upstream 
 */
async function* pipeGzipStream(upstream) {
  const reader = new QuickReader(upstream)
  const header = reader.bytes(10) ?? await A

  // https://www.rfc-editor.org/rfc/rfc1952#page-5
  // [0, 1]  ID1 ID2
  // [2]     CM
  // [3]     FLG
  // [4, 7]  MTIME
  // [8]     XFL
  // [9]     OS
  const flags = header[3]

  if (flags & 0b100) {
    // [10, 11]  SI1 | SI2
    // [12, 13]  len
    const len = reader.u16() ?? await A
    reader.skip(len) ?? await A
    console.log('FEXTRA len:', len)
  }

  if (flags & 0b1000) {
    const filename = reader.txt() ?? await A
    console.log('FNAME:', filename)
  }

  if (flags & 0b10000) {
    const comment = reader.txt() ?? await A
    console.log('FCOMMENT:', comment)
  }

  if (flags & 0b10) {
    console.log('FHCRC')
    reader.skip(2) ?? await A
  }

  yield injectGzipBuf

  // read data chunk by chunk until last 8 bytes
  yield* reader.chunksToEnd(8)

  const rawCrc = reader.u32() ?? await A
  const rawLen = reader.u32() ?? await A

  const newCrc = Crc32Combine(injectGzipCrc, rawCrc, rawLen)
  const newLen = rawLen + INJECT_HTML.length

  console.log('rawCrc:', rawCrc, 'newCrc:', newCrc)
  console.log('rawLen:', rawLen, 'newLen:', newLen)

  TRAILER_U32[0] = newCrc
  TRAILER_U32[1] = newLen
  yield TRAILER_BUF
}


const svr = http.createServer((clientReq, clientRes) => {
  console.log(clientReq.url)

  // gzip only
  const acceptEncoding = clientReq.headers['accept-encoding'] + ''

  if (/gzip/i.test(acceptEncoding)) {
    clientReq.headers['accept-encoding'] = 'gzip'
  } else {
    delete clientReq.headers['accept-encoding']
  }

  let targetUrl
  try {
    targetUrl = new URL(clientReq.url.replace('/?', ''))
  } catch {
    clientRes.end('invalid target url')
    return
  }
  clientReq.headers.host = targetUrl.host

  let fn
  if (targetUrl.protocol === 'https:') {
    fn = https.request
  } else if (targetUrl.protocol === 'http:') {
    fn = http.request
  } else {
    clientRes.end('invalid target url protocol')
    return
  }

  const serverReq = fn(targetUrl, {
    method: clientReq.method,
    headers: clientReq.headers,
  }, (serverRes) => {

    const {statusCode} = serverRes

    // ignore injection
    if (statusCode === 304 ||
        statusCode === 204 ||
        !/text\/html/i.test(serverRes.headers['content-type'])
    ) {
      clientRes.writeHead(statusCode, serverRes.statusMessage, serverRes.headers)
      pipeline(serverRes, clientRes, (err) => {
        if (err) {
          console.error('stream err:', err.message)
        }
      })
      return
    }

    delete serverRes.headers['content-length']
    clientRes.writeHead(statusCode, serverRes.statusMessage, serverRes.headers)

    const contentEncoding = serverRes.headers['content-encoding'] || ''

    if (/gzip/i.test(contentEncoding)) {
      pipeline(serverRes, pipeGzipStream, clientRes, (err) => {
        if (err) {
          console.error('gzip stream err:', err)
        }
      })
    } else {
      clientRes.write(INJECT_HTML)
      pipeline(serverRes, clientRes, (err) => {
        if (err) {
          console.error('plain stream err:', err.message)
        }
      })
    }
  })
  pipeline(clientReq, serverReq, (err) => {
    if (err) {
      console.error('req stream err:', err.message)
    }
  })
}).listen(8000, () => {
  console.log('proxy server. listen', svr.address().port)
})