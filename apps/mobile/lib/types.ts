export interface Pairing {
  scheme: 'http';
  host: string;
  port: number;
  deviceToken: string;
  privateKey: string;
  publicKey: string;
  name: string;
}

export interface ParsedUri {
  scheme: 'http';
  host: string;
  port: number;
  token: string;
}
