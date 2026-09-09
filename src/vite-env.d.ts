/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 中央气象台接口基地址。留空则直连 https://www.nmc.cn。
   * 内网部署时设为自建反代前缀,例如 /api/nmc。
   */
  readonly VITE_NMC_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /**
   * 由 index.html 的内联脚本注入:把当前页完整地址(pathname+search+hash)同步进
   * <link rel="manifest"> 的 ?start=,让"添加到主屏幕"保留完整参数。
   * 应用侧路由/学生切换后调用即可,不要另写一份实现。
   */
  __syncManifest?: () => void;
}
