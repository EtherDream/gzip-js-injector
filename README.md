# 网关层 GZIP 页面零开销注入脚本

## 原理

https://www.cnblogs.com/index-html/p/inject-js-into-a-gzipped-html-without-decompressing.html

## 安装

```bash
npm install
```

由于需调用 zlib 的 `Crc32Combine` 函数，这里使用 node-gyp 导出一个 C++ 模块，安装时会自动编译。

## 测试服务

```bash
node tests/server/index.js
```

http://127.0.0.1:9000/?line=50&delay=200&algo=gzip&error=0.01


测试 gzip 流模式输出。

参数说明：

* line 输出多少行。（这里每行为一块）

* delay 每次输出间隔。

* algo 压缩算法。目前只支持 gzip，为空则不压缩

* error 出错概率。（上述每次输出有 1% 的概率导致流终止）


## 代理服务

```bash
node index.js
```

使用方式为 http://127.0.0.1:8000/?target_url

例如：

http://127.0.0.1:8000/?https://www.tmall.com

验证 JS 是否成功注入到从 127.0.0.1:9000 的 gzip 数据流中：

http://127.0.0.1:8000/?http://127.0.0.1:9000/?line=50&delay=200&algo=gzip&error=0.01

验证文件尾的校验是否正确（浏览器不会校验，Node.js 的 fetch 会校验）：

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

## TODO

支持 brotli 压缩