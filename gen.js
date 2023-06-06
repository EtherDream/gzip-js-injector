import zlib from 'node:zlib'

/**
 * @param {Buffer} html 
 * @returns {Promise<[Buffer, number]>}
 */
export function genGzipInject(html) {
  const stream = zlib.createGzip()
  let state = 0
  let buf

  return new Promise(callback => {
    stream.on('data', chunk => {
      if (state === 0) {
        // header
        buf = chunk
      } else if (state === 1) {
        // body
        buf = Buffer.concat([buf, chunk])
        stream.end()
      } else {
        // trailer
        const crc = chunk.readUint32LE(chunk.length - 8)
        callback([buf, crc])
      }
      state++
    })

    stream.write(html)
    stream.flush()
  })
}
