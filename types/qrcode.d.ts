declare module 'qrcode' {
  type Options = { type?: 'png' | 'svg'; errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; margin?: number; width?: number };
  const QRCode: {
    toString(text: string, options?: Options): Promise<string>;
    toBuffer(text: string, options?: Options): Promise<Buffer>;
  };
  export default QRCode;
}
