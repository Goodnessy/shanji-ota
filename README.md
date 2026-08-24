# 闪记 OTA

这是「闪记」Android 客户端的公开在线更新仓库。

本仓库只用于发布更新元数据和 APK，不存放闪记私有源码。

## 文件

- `version.json`：客户端检查更新入口
- GitHub Releases：正式 APK 发布位置

## 发布约定

1. 所有可覆盖升级的 APK 必须使用同一正式签名证书。
2. 发布新版 APK 后更新 `version.json`。
3. `versionCode` 必须严格递增。
4. `sha256` 必须与发布 APK 完全一致。
5. 正式发布前先完成本地编译与实机验证。
