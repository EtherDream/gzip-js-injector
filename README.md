## Introduction

A demo of HTTP proxy/gateway injection. The proxy injects a script into a gzip-compressed HTML response without decompressing the response body.


## How it Works

The gateway prepends a script tag at the beginning of the HTML document:

```diff
+<!doctype html><script src="inject.js"></script>
<!doctype html>
<html>
  <head>...</head>
  <body>...</body>
</html>
```

This is not strictly standards-compliant, but it works in major browsers.

When forwarding a response, the gateway writes the injected content first. If the upstream payload is compressed, it writes a pre-compressed injection prefix.

For a raw DEFLATE stream, two independently-compressed streams can be concatenated and decoded as a single stream:

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

This works because the injected prefix ends with a non-final DEFLATE block (BFINAL=0), so the decoder continues into the upstream data and its back-references still resolve correctly.

For gzip, the upstream gzip header must be removed, and the trailer fields (crc and len) must be updated. Many browsers appear to ignore trailer validation for streaming responses, but some libraries validate it.


## Installation

```bash
npm install
```

This project uses zlib’s `crc32_combine`. It is wrapped with node-gyp and compiled automatically during installation.


## Mock an Upstream Server

```bash
node tests/server/index.js
```

Example:

http://127.0.0.1:9000/?line=50&delay=200&algo=gzip&error=0.01

Parameters:

* line: Number of lines to output. (each line is emitted as one data block)

* delay: Output interval in milliseconds.

* algo: Compression algorithm (gzip or omit for no compression).

* error: Probability of aborting the stream on each write (e.g., 0.01 = 1%).


## Gateway Testing

```bash
node index.js
```

Usage:

http://127.0.0.1:8000/?target_url

Example:

http://127.0.0.1:8000/?https://www.tmall.com

<img width="2080" height="1454" alt="image" src="https://github.com/user-attachments/assets/e540c975-b7a1-4c06-b1b2-c38de49c3ebd" />

> The console prints “Hi jack”, and the page is still gzip-compressed. The gateway injected the script without decompression, as expected.

Using the mocked upstream server:

http://127.0.0.1:8000/?http://127.0.0.1:9000/?line=50&delay=200&algo=gzip&error=0.01

Testing gzip trailer validation. Browsers typically don’t validate the gzip trailer, but some libraries do (e.g., Node.js fetch):

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

For details on updating the CRC, see:

https://stackoverflow.com/questions/23122312/crc-calculation-of-a-mostly-static-data-stream/23126768

https://github.com/stbrumme/crc32/blob/master/Crc32.cpp#L560


## Stream Processing

This project uses an interesting library, [QuickReader](https://github.com/EtherDream/QuickReader), which makes stream processing simpler and more efficient.


## TODO

Support brotli compression.
