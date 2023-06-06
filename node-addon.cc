#include <napi.h>
#include <zlib.h>


Napi::Value Crc32Combine(const Napi::CallbackInfo& info) {
  auto crc1 = info[0].As<Napi::Number>().Uint32Value();
  auto crc2 = info[1].As<Napi::Number>().Uint32Value();
  auto len2 = info[2].As<Napi::Number>().Uint32Value();

  auto crc = crc32_combine(crc1, crc2, len2);
  return Napi::Number::New(info.Env(), crc);
}

Napi::Value Adler32Combine(const Napi::CallbackInfo& info) {
  auto adler1 = info[0].As<Napi::Number>().Uint32Value();
  auto adler2 = info[1].As<Napi::Number>().Uint32Value();
  auto len2 = info[2].As<Napi::Number>().Uint32Value();

  auto adler = adler32_combine(adler1, adler2, len2);
  return Napi::Number::New(info.Env(), adler);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports["Crc32Combine"] = Napi::Function::New(env, Crc32Combine);
  exports["Adler32Combine"] = Napi::Function::New(env, Adler32Combine);
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
