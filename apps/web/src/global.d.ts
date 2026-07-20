declare module '*.png' {
  const content: any;
  export default content;
}

declare module '*.jpg' {
  const content: any;
  export default content;
}

declare module '*.jpeg' {
  const content: any;
  export default content;
}

declare module '*.svg' {
  const content: any;
  export default content;
}

interface AliyunCaptchaInstance {
  show: () => void;
  hide?: () => void;
}

type AliyunCaptchaErrorInfo = { code?: string | number; msg?: string };

interface AliyunCaptchaOptions {
  SceneId: string;
  mode: 'popup' | 'embed';
  element: string;
  button?: string;
  UserCertifyId?: string;
  prefix?: string;
  region?: string;
  success: (captchaVerifyParam: string) => void;
  fail?: (result?: unknown) => void;
  getInstance: (instance: AliyunCaptchaInstance) => void;
  slideStyle?: { width: number; height: number };
  language?: string;
  timeout?: number;
  rem?: number;
  onError?: (errorInfo: AliyunCaptchaErrorInfo) => void;
  onClose?: () => void;
  captchaLogoImg?: string;
  dualStack?: boolean;
  showErrorTip?: boolean;
  delayBeforeSuccess?: boolean;
  EncryptedSceneId?: string;
  zIndex?: number;
}

interface Window {
  initAliyunCaptcha: (config: AliyunCaptchaOptions) => void;
  AliyunCaptchaConfig: {
    region: string;
    prefix: string;
  };
}
