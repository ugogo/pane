// Metro/Expo global: true in dev mode, false in production
declare const __DEV__: boolean;

// Allow CSS file imports in route layouts
declare module '*.css' {
  const stylesheet: Record<string, string>;
  export default stylesheet;
}

declare module '*.woff2' {
  const asset: string | number;
  export default asset;
}
