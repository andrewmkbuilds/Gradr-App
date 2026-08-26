/**
 * Single entry point that arms the QA sandbox. Called once at boot; a no-op
 * unless the sandbox is available on this host/build.
 */
import { isSandboxAvailable } from "./flags";
import { installNetworkSandbox } from "./network";
import { installMediaSandbox } from "./media";

export function installQaSandbox(): void {
  if (!isSandboxAvailable()) return;
  installNetworkSandbox();
  installMediaSandbox();
}

export * from "./flags";
