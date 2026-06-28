export const MAIN_SHELL_PATHS = [
  '/capture',
  '/display',
  '/sound',
  '/lights',
  '/accent',
  '/startup',
  '/companion',
  '/diagnostics',
] as const;

type MainShellPath = (typeof MAIN_SHELL_PATHS)[number];

export function isMainShellPath(pathname: string) {
  return MAIN_SHELL_PATHS.includes(pathname as MainShellPath);
}
