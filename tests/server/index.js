import http from 'node:http'
import { pipeline } from 'node:stream'
import zlib from 'node:zlib'


const sleep = (delay) => new Promise(f => setTimeout(f, delay))


const svr = http.createServer((req, res) => {
  console.log(req.url, req.headers)

  const pos = req.url.indexOf('?')
  let query
  if (pos === -1) {
    query = ''
  } else {
    query = req.url.substring(pos + 1)
  }
  const params = new URLSearchParams(query)

  const type = params.get('type') || 'text/html'
  const algo = params.get('algo') || ''
  const line = +params.get('line') || 10
  const delay = +params.get('delay') || 50
  const error = +params.get('error') || 0

  res.setHeader('content-type', type)

  const filters = []

  if (algo === 'gzip') {
    res.setHeader('content-encoding', 'gzip')

    filters[0] = zlib.createGzip({
      flush: zlib.constants.Z_PARTIAL_FLUSH,
    })
  }

  pipeline(async function*() {
    yield `<html><title>Hello</title><body>\n`

    for (let i = 0; i < line; i++) {
      yield `<div>Chunk: ${i}</div>\n` +
        `<!-- PADDING ${Date.now()} -->\n`

      if (error && Math.random() < error) {
        res.destroy()
        return
      }
      if (delay) {
        await sleep(delay)
      }
    }
    yield `</body></html>`

  }, ...filters, res, err => {
    if (err) {
      console.error(err.message)
    }
  })
}).listen(9000, () => {
  console.log('backend server. listen', svr.address().port)
})