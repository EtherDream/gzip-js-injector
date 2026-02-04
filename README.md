## Introduction

An HTTP gateway injection demo. The proxy injects a script into a gzipped page without decompressing the traffic.


## How it Works

The gateway can directly insert a script into the top of the HTML:

```diff
+<!doctype html><script src="inject.js"></script>
<!doctype html>
<html>
  <head>...</head>
  <body>...</body>
</html>
```

While not standard, this is compatible with all browsers.

When forwarding, the gateway only needs to output the injected data first. If the upstream is compressed, it outputs the pre-compressed injected data.

For *deflate* compression, the two compressed data can be directly concatenated:

```js
const zlib = require('zlib')
const http = require('http')

const upstreamHtml = '<p>Hello World</p>'
const injectedHtml = '<p>inject</p>'

const upstreamBuf = zlib.deflateRawSync(upstreamHtml)

// create an unfinished block
let injectedBuf = Buffer.alloc(0)

const tmp = zlib.createDeflateRaw()
tmp.on('data', buf => {
  injectedBuf = Buffer.concat([injectedBuf, buf])
})
tmp.write(injectedHtml)
tmp.flush()

// gateway (http://127.0.0.1:8080/)
http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html')
  res.setHeader('content-encoding', 'deflate')
  res.write(injectedBuf)
  res.end(upstreamBuf)
}).listen(8080)
```

[RFC1951](https://www.rfc-editor.org/rfc/rfc1951#page-4) specifies that  pointers to duplicate data are represented as `<length, backward distance>`, which is a relative position unaffected by the insertion of our blocks at the beginning.

For *gzip* compression, the upstream header needs to be removed, and the *crc* and *len* fields at the end need to be updated (browsers don't verify these, but some libraries do).


## Installation

```bash
npm install
```

This project uses the `Crc32Combine` function from zlib. This function is wrapped using node-gyp, which will be automatically compiled during installation.


## Mock an Upstream Server

```bash
node tests/server/index.js
```

Example:

http://127.0.0.1:9000/?line=50&delay=200&algo=gzip&error=0.01

Parameters:

* line: Number of lines to output. (Each line is a data block)

* delay: Output interval. (In milliseconds)

* algo: Compression algorithm. ("gzip" or empty)

* error: Error probability. (In the above example, there is a 1% probability that each output will cause the stream to terminate)


## Gateway Testing

```bash
node index.js
```

Usage:

http://127.0.0.1:8000/?target_url

Example:

http://127.0.0.1:8000/?https://www.tmall.com

<img width="2080" height="1454" alt="image" src="https://github.com/user-attachments/assets/e540c975-b7a1-4c06-b1b2-c38de49c3ebd" />

> The console displays logs for “Hi jack”, and the page remains in gzip format. The gateway injected our script without decompression, as expected.

Using the mocked upstream server:

http://127.0.0.1:8000/?http://127.0.0.1:9000/?line=50&delay=200&algo=gzip&error=0.01

Testing gzip trailer validation. Browsers don't validate them, but some libraries do, such as Node.js's fetch:

```js
const url = 'http://127.0.0.1:8000/?https://www.tmall.com'
const res = await fetch(url)
const reader = res.body.getReader()
for (;;) {
  const {done, value} = await reader.read()
  if (done) {
    break
  }
  console.log(value)
}
```

If you remove `TRAILER_U32[0] = newCrc` from `index.js`, the above code will throw an error when reading the last chunk:

```
Uncaught TypeError: terminated
    at Fetch.onAborted ...
  [cause]: Error: incorrect data check
      at Zlib.zlibOnError [as onerror] ...
    code: 'Z_DATA_ERROR'
```

For how to update the CRC, please refer to:

https://stackoverflow.com/questions/23122312/crc-calculation-of-a-mostly-static-data-stream/23126768

https://github.com/stbrumme/crc32/blob/master/Crc32.cpp#L560


## Stream Processing

This project uses an interesting library, [QuickReader](https://github.com/EtherDream/QuickReader), which makes stream processing simpler and efficient.


## TODO

Support brotli compression.