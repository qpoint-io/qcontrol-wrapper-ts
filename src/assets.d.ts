/**
 * Declares bundled binary imports so Bun can resolve vendored executables as
 * filesystem paths during wrapper builds.
 */
declare module "*.bin" {
  const path: string;
  export default path;
}
